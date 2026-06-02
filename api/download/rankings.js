const { buildData, toCsv } = require('../../server');

module.exports = async function handler(_request, response) {
  try {
    const data = await buildData();
    const csv = toCsv(data.rankings, [
      { header: 'name', key: 'name' },
      { header: 'fantasypros_rank', key: 'fantasypros_rank' },
      { header: 'espn_rank', key: 'espn_rank' },
      { header: 'sleeper_rank', key: 'sleeper_rank' },
    ]);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="rankings.csv"');
    response.status(200).send(csv);
  } catch (error) {
    response.status(500).send(error.message);
  }
};
