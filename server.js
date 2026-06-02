const ExcelJS = require('exceljs');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT || 3000);

const SOURCES = {
  espnRankingsPdf: 'https://g.espncdn.com/s/ffldraftkit/26/NFL26_CS_PPR300.pdf?adddata=2026CS_PPR300',
  draftSharksSleeperAdp: 'https://www.draftsharks.com/adp/ppr/sleeper/12',
  fantasyPros: 'https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php',
  espnLiveDraftResults:
    'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info',
};

const ESPN_LIVE_DRAFT_PAGES = 21;
const ESPN_LIVE_DRAFT_PAGE_SIZE = 25;

const ESPN_PRO_TEAMS = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
};

const ESPN_DEFENSE_POSITION_IDS = new Set([16]);

const ESPN_POSITION_IDS = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST',
};

const DEFAULT_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

let cache = null;

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  return [
    columns.map((column) => csvEscape(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(',')),
  ].join('\r\n');
}

function normalizeName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b([a-z])\./gi, '$1')
    .replace(/['’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '')
    .replace(/\bd\/st\b/gi, 'defense')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function normalizeTeam(team) {
  const normalized = String(team || '').trim().toUpperCase();
  if (normalized === 'LVR') return 'LV';
  if (normalized === 'JAC') return 'JAX';
  return normalized;
}

function getNameParts(name) {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  return {
    first: parts[0] || '',
    last: parts[parts.length - 1] || '',
  };
}

function areFirstNamesCompatible(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function compareNullableRank(a, b, key) {
  const av = a[key] ?? Number.POSITIVE_INFINITY;
  const bv = b[key] ?? Number.POSITIVE_INFINITY;
  if (av !== bv) return av - bv;
  return 0;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { headers: { ...DEFAULT_HEADERS, accept: 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function extractAssignedObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Could not find marker: ${marker}`);

  const start = text.indexOf('{', markerIndex);
  if (start < 0) throw new Error(`Could not find object after marker: ${marker}`);

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  throw new Error(`Could not close object after marker: ${marker}`);
}

async function getFantasyProsRanks() {
  const html = await fetchText(SOURCES.fantasyPros);
  const data = JSON.parse(extractAssignedObject(html, 'var ecrData = '));

  return data.players.map((player) => ({
    name: player.player_name,
    key: normalizeName(player.player_name),
    team: normalizeTeam(player.player_team_id),
    position: player.player_position_id,
    rank: Number(player.rank_ecr),
  })).filter((player) => !['DST', 'DEF'].includes(player.position));
}

async function getEspnPdfRanks() {
  const buffer = await fetchBuffer(SOURCES.espnRankingsPdf);

  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }

      multiply() {
        return this;
      }

      translate() {
        return this;
      }

      scale() {
        return this;
      }

      rotate() {
        return this;
      }

      transformPoint(point = {}) {
        return { x: point.x || 0, y: point.y || 0 };
      }
    };
  }

  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData {};
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D {};

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href;

  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  let text = '';

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => item.str).join(' ')}\n`;
  }

  const matches = text.matchAll(/(\d+)\.\s+\(([A-Z]+)[0-9]+\)\s+(.+?),\s+([A-Z]{2,3})\s+\$\d+\s+\d+/g);

  return Array.from(matches, (match) => ({
    name: match[3].trim(),
    key: normalizeName(match[3]),
    position: match[2],
    team: normalizeTeam(match[4]),
    rank: Number(match[1]),
  })).filter((player) => player.position !== 'DST');
}

async function getSleeperRanks() {
  const rows = await getDraftSharksAdpRows({
    url: SOURCES.draftSharksSleeperAdp,
    source: 'sleeper',
  });

  return rows.map((row) => ({
    name: row.Name,
    key: normalizeName(row.Name),
    team: normalizeTeam(row.Team),
    rank: row.ADP,
  }));
}

function getDraftSharksAdpKey(typeAttr, superAttr, scoringAttr, sourceAttr, sizeAttr) {
  let formatId;

  if (typeAttr === '' && scoringAttr === '') formatId = 10;
  if (typeAttr === '' && scoringAttr === 'half-ppr') formatId = 18;
  if (typeAttr === '' && scoringAttr === 'ppr') formatId = superAttr === 'superflex' ? 12 : 11;
  if (typeAttr === '' && scoringAttr === 'te-premium') formatId = 15;
  if (typeAttr === '' && scoringAttr === 'idps') formatId = 21;

  const sourceIds = {
    ffpc: 103,
    consensus: 104,
    sleeper: 107,
    underdog: 108,
    yahoo: 109,
    cbs: 110,
    espn: 111,
  };

  if (!formatId || !sourceIds[sourceAttr]) {
    throw new Error(`Unsupported DraftSharks ADP key: ${typeAttr}/${superAttr}/${scoringAttr}/${sourceAttr}/${sizeAttr}`);
  }

  return `${formatId}::${sourceIds[sourceAttr]}::${sizeAttr}`;
}

async function getDraftSharksAdpRows({ url, source }) {
  const html = await fetchText(url);
  const data = JSON.parse(extractAssignedObject(html, 'var vueAppData = '));
  const adpKey = getDraftSharksAdpKey('', '', 'ppr', source, '12');

  return data.projections
    .filter((player) => player.adps?.[adpKey])
    .filter((player) => !['DEF', 'DL', 'LB', 'DB', 'TQB', 'TK', 'HC'].includes(player.fantasy_position))
    .sort((a, b) => Number(a.adps[adpKey].overall_pick_number) - Number(b.adps[adpKey].overall_pick_number))
    .map((player, index) => ({
      Name: `${player.first_name} ${player.last_name}`.replace(/\s+/g, ' ').trim(),
      Team: normalizeTeam(player.team?.abbr),
      ADP: index + 1,
    }));
}

async function getEspnAdpRows() {
  const pages = [];
  const batchSize = 3;

  for (let start = 0; start < ESPN_LIVE_DRAFT_PAGES; start += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, ESPN_LIVE_DRAFT_PAGES - start) }, async (_value, batchIndex) => {
      const index = start + batchIndex;
      const filter = {
        players: {
          filterSlotIds: { value: [0, 2, 4, 6, 17, 16, 8, 9, 10, 12, 13, 14, 15] },
          limit: ESPN_LIVE_DRAFT_PAGE_SIZE,
          offset: index * ESPN_LIVE_DRAFT_PAGE_SIZE,
          sortAdp: { sortAsc: true, sortPriority: 2 },
        },
      };

      return fetchJson(SOURCES.espnLiveDraftResults, {
        headers: {
          'x-fantasy-filter': JSON.stringify(filter),
        },
      });
    });

    pages.push(...(await Promise.all(batch)));
  }

  const byEspnPlayerId = new Map();
  for (const player of pages.flatMap((page) => page.players || []).map((row) => row.player).filter(Boolean)) {
    byEspnPlayerId.set(player.id, player);
  }

  return Array.from(byEspnPlayerId.values())
    .filter((player) => player?.fullName)
    .filter((player) => !ESPN_DEFENSE_POSITION_IDS.has(player.defaultPositionId))
    .filter((player) => Number.isFinite(Number(player.ownership?.averageDraftPosition)))
    .sort((a, b) => Number(a.ownership.averageDraftPosition) - Number(b.ownership.averageDraftPosition))
    .map((player, index) => ({
      Name: player.fullName,
      Team: normalizeTeam(ESPN_PRO_TEAMS[player.proTeamId]),
      Position: ESPN_POSITION_IDS[player.defaultPositionId] || '',
      key: normalizeName(player.fullName),
      ADP: index + 1,
      'ESPN ADP': index + 1,
    }));
}

function addRankSource(map, sourceRows, rankColumn) {
  for (const row of sourceRows) {
    if (!row.key) continue;

    const existing = map.get(row.key) || findTeamNameFallback(map, row, rankColumn);

    if (existing) {
      existing.name = existing.name || row.name;
      existing.team = existing.team || row.team || '';
      existing[rankColumn] = row.rank;
      continue;
    }

    map.set(row.key, {
      key: row.key,
      name: row.name,
      team: row.team || '',
      fantasypros_rank: null,
      espn_rank: null,
      sleeper_rank: null,
      [rankColumn]: row.rank,
    });
  }
}

function findTeamNameFallback(map, row, rankColumn) {
  if (!row.team) return null;

  const rowParts = getNameParts(row.name);
  if (!rowParts.last) return null;

  const candidates = Array.from(map.values()).filter((candidate) => {
    if (candidate[rankColumn] !== null && candidate[rankColumn] !== undefined) return false;
    if (candidate.team !== row.team) return false;

    const candidateParts = getNameParts(candidate.name);
    return candidateParts.last === rowParts.last && areFirstNamesCompatible(candidateParts.first, rowParts.first);
  });

  return candidates.length === 1 ? candidates[0] : null;
}

function findCanonicalPlayerName(map, row) {
  const exact = map.get(row.key || normalizeName(row.Name));
  if (exact) return exact.name;

  if (!row.Team) return row.Name;

  const rowParts = getNameParts(row.Name);
  const candidates = Array.from(map.values()).filter((candidate) => {
    if (candidate.team !== row.Team) return false;

    const candidateParts = getNameParts(candidate.name);
    return candidateParts.last === rowParts.last && areFirstNamesCompatible(candidateParts.first, rowParts.first);
  });

  return candidates.length === 1 ? candidates[0].name : row.Name;
}

async function buildData({ refresh = false } = {}) {
  if (cache && !refresh) return cache;

  const fetchedAt = new Date();
  const sourceResults = await Promise.allSettled([
    getFantasyProsRanks(),
    getEspnPdfRanks(),
    getSleeperRanks(),
    getEspnAdpRows(),
  ]);
  const sourceNames = ['FantasyPros ECR', 'ESPN PDF rankings', 'Sleeper ADP', 'ESPN live ADP'];
  const failures = sourceResults
    .map((result, index) => ({ result, source: sourceNames[index] }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ result, source }) => `${source}: ${result.reason?.message || result.reason}`);

  if (failures.length) {
    throw new Error(`Source download failed. ${failures.join(' | ')}`);
  }

  const [fantasyPros, espnPdf, sleeper, adp] = sourceResults.map((result) => result.value);

  const byPlayer = new Map();
  addRankSource(byPlayer, fantasyPros, 'fantasypros_rank');
  addRankSource(byPlayer, espnPdf, 'espn_rank');
  addRankSource(byPlayer, sleeper, 'sleeper_rank');

  const rankings = Array.from(byPlayer.values())
    .sort(
      (a, b) =>
        compareNullableRank(a, b, 'fantasypros_rank') ||
        compareNullableRank(a, b, 'espn_rank') ||
        compareNullableRank(a, b, 'sleeper_rank') ||
        a.name.localeCompare(b.name)
    )
    .map(({ name, fantasypros_rank, espn_rank, sleeper_rank }) => ({
      name,
      fantasypros_rank,
      espn_rank,
      sleeper_rank,
    }));

  const canonicalNames = new Map(
    rankings.map((row) => [
      normalizeName(row.name),
      {
        name: row.name,
        team: byPlayer.get(normalizeName(row.name))?.team || '',
        espn_rank: row.espn_rank,
      },
    ])
  );

  const canonicalAdp = adp.map((row) => ({
    Name: findCanonicalPlayerName(canonicalNames, row),
    'ESPN ADP': row['ESPN ADP'],
    Position: row.Position,
  }));

  cache = {
    fetchedAt: fetchedAt.toISOString(),
    counts: {
      fantasyPros: fantasyPros.length,
      espnPdf: espnPdf.length,
      sleeper: sleeper.length,
      rankings: rankings.length,
      adp: canonicalAdp.length,
    },
    rankings,
    adp: canonicalAdp,
  };

  return cache;
}

async function buildWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rankinga';
  workbook.created = new Date();

  const rankingsSheet = workbook.addWorksheet('rankings');
  rankingsSheet.columns = [
    { header: 'name', key: 'name', width: 28 },
    { header: 'fantasypros_rank', key: 'fantasypros_rank', width: 18 },
    { header: 'espn_rank', key: 'espn_rank', width: 12 },
    { header: 'sleeper_rank', key: 'sleeper_rank', width: 14 },
  ];
  rankingsSheet.addRows(data.rankings);

  const adpSheet = workbook.addWorksheet('adp');
  adpSheet.columns = [
    { header: 'Name', key: 'Name', width: 28 },
    { header: 'ESPN ADP', key: 'ESPN ADP', width: 12 },
    { header: 'Position', key: 'Position', width: 12 },
  ];
  adpSheet.addRows(data.adp);

  for (const sheet of [rankingsSheet, adpSheet]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  return workbook.xlsx.writeBuffer();
}

function createApp() {
  const express = require('express');
  const app = express();

  app.use(express.static('public'));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.get('/api/data', async (request, response) => {
    try {
      response.json(await buildData({ refresh: request.query.refresh === '1' }));
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  app.get('/download/rankings.csv', async (_request, response) => {
    try {
      const data = await buildData();
      const csv = toCsv(data.rankings, [
        { header: 'name', key: 'name' },
        { header: 'fantasypros_rank', key: 'fantasypros_rank' },
        { header: 'espn_rank', key: 'espn_rank' },
        { header: 'sleeper_rank', key: 'sleeper_rank' },
      ]);

      response.type('text/csv');
      response.attachment('rankings.csv');
      response.send(csv);
    } catch (error) {
      response.status(500).send(error.message);
    }
  });

  app.get('/download/adp.csv', async (_request, response) => {
    try {
      const data = await buildData();
      const csv = toCsv(data.adp, [
        { header: 'Name', key: 'Name' },
        { header: 'ESPN ADP', key: 'ESPN ADP' },
        { header: 'Position', key: 'Position' },
      ]);

      response.type('text/csv');
      response.attachment('adp.csv');
      response.send(csv);
    } catch (error) {
      response.status(500).send(error.message);
    }
  });

  app.get('/download/workbook.xlsx', async (_request, response) => {
    try {
      const workbook = await buildWorkbook(await buildData());

      response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      response.attachment('fantasy-rankings.xlsx');
      response.send(Buffer.from(workbook));
    } catch (error) {
      response.status(500).send(error.message);
    }
  });

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => {
    console.log(`Rankinga is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  buildData,
  buildWorkbook,
  createApp,
  toCsv,
  SOURCES,
};
