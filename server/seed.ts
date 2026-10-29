import 'dotenv/config';

const reset = process.argv.includes('--reset-sample');
if (reset) process.env.EVENTSYNC_SKIP_AUTO_SEED = '1';

const database = await import('./db.js');
if (reset) {
  database.resetOperationalDataAndSeed();
  console.log('Operational data reset. Demo accounts were kept; sample venues and events are ready.');
} else {
  database.seed();
  console.log('EventSync demo data is ready.');
}
