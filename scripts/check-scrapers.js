const { buildData } = require('../server');

(async () => {
  const data = await buildData({ refresh: true });

  console.log(`Rankings rows: ${data.counts.rankings}`);
  console.log(`ADP rows: ${data.counts.adp}`);
  console.log('Rankings sample:');
  console.table(data.rankings.slice(0, 5));
  console.log('ADP sample:');
  console.table(data.adp.slice(0, 5));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
