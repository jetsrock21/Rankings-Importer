const { buildData, toCsv } = require('../../server');

module.exports = async function handler(_request, response) {
  try {
    const data = await buildData();
    const csv = toCsv(data.adp, [
      { header: 'Name', key: 'Name' },
      { header: 'ESPN ADP', key: 'ESPN ADP' },
      { header: 'Position', key: 'Position' },
    ]);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="adp.csv"');
    response.status(200).send(csv);
  } catch (error) {
    response.status(500).send(error.message);
  }
};
