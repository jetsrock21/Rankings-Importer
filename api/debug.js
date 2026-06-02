module.exports = async function handler(_request, response) {
  const report = {
    ok: false,
    node: process.version,
    steps: [],
  };

  try {
    report.steps.push('loading server module');
    const { buildData } = require('../server');

    report.steps.push('running buildData');
    const data = await buildData({ refresh: true });

    report.ok = true;
    report.counts = data.counts;
    response.status(200).json(report);
  } catch (error) {
    report.error = {
      name: error.name,
      message: error.message,
      stack: String(error.stack || '').split('\n').slice(0, 8),
    };
    response.status(500).json(report);
  }
};
