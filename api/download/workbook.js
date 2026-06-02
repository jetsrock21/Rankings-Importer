const { buildData, buildWorkbook } = require('../../server');

module.exports = async function handler(_request, response) {
  try {
    const workbook = await buildWorkbook(await buildData());

    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', 'attachment; filename="fantasy-rankings.xlsx"');
    response.status(200).send(Buffer.from(workbook));
  } catch (error) {
    response.status(500).send(error.message);
  }
};
