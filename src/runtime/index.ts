import { createRuntimeLogging } from './logging.js';
import { PANEON_HOME } from '../shared/paths.js';

// Create the destination before importing/restoring the service.
const logging = createRuntimeLogging(PANEON_HOME);
process.on('uncaughtExceptionMonitor', (err) => {
  logging.logger.fatal({ err }, 'Uncaught runtime exception');
  // Node retains its fatal exit behavior; this write is best effort.
});
try {
  const { startServer } = await import('./server.js');
  await startServer(PANEON_HOME, logging);
} catch (err) {
  logging.logger.fatal({ err }, 'Runtime entry failed');
  await logging.close();
  process.exit(1);
}
