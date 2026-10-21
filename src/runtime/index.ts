import { startServer } from './server.js';
void startServer().catch(() => {
  process.exitCode = 1;
});
