const { buildData } = require('../server');

module.exports = async function handler(request, response) {
  try {
    const data = await buildData({ refresh: request.query.refresh === '1' });
    response.status(200).json(data);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
};
