const statusEl = document.getElementById('status');
const refreshButton = document.getElementById('refresh');
const statsEl = document.getElementById('stats');
const rankingsBody = document.getElementById('rankingsBody');
const adpBody = document.getElementById('adpBody');
const rankingsCount = document.getElementById('rankingsCount');
const adpCount = document.getElementById('adpCount');
const downloadLinks = ['workbook', 'rankingsCsv', 'adpCsv'].map((id) => document.getElementById(id));

function setDownloadsEnabled(enabled) {
  for (const link of downloadLinks) {
    link.classList.toggle('disabled', !enabled);
    link.setAttribute('aria-disabled', String(!enabled));
  }
}

function cell(value) {
  const td = document.createElement('td');
  td.textContent = value ?? '';
  return td;
}

function renderRows(tbody, rows, keys) {
  tbody.replaceChildren();

  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const key of keys) tr.appendChild(cell(row[key]));
    tbody.appendChild(tr);
  }
}

function renderStats(data) {
  const fetchedAt = new Date(data.fetchedAt);
  statsEl.innerHTML = `
    <div><strong>${data.counts.rankings}</strong><span>ranking rows</span></div>
    <div><strong>${data.counts.adp}</strong><span>ADP rows</span></div>
    <div><strong>${fetchedAt.toLocaleString()}</strong><span>last pull</span></div>
  `;
}

async function loadData(refresh = false) {
  refreshButton.disabled = true;
  setDownloadsEnabled(false);
  statusEl.textContent = refresh ? 'Refreshing source data...' : 'Downloading source data...';

  try {
    const response = await fetch(`/api/data${refresh ? '?refresh=1' : ''}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Data download failed');

    renderStats(data);
    renderRows(rankingsBody, data.rankings, ['name', 'fantasypros_rank', 'espn_rank', 'sleeper_rank']);
    renderRows(adpBody, data.adp, ['Name', 'ESPN ADP', 'Position']);
    rankingsCount.textContent = `${data.counts.rankings} rows`;
    adpCount.textContent = `${data.counts.adp} rows`;
    statusEl.textContent = 'Data is ready. Download the workbook or either CSV.';
    setDownloadsEnabled(true);
  } catch (error) {
    statusEl.textContent = error.message;
    rankingsBody.replaceChildren();
    adpBody.replaceChildren();
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', () => loadData(true));
loadData(false);
