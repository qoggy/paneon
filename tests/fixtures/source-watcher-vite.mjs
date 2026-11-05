import { createServer as createViteServer } from 'vite';
export * from 'vite';

// Exercise the production SourceWatcher with Vite's real NodeFs handler.
// macOS fs.watch can lose events immediately after concurrent registration,
// even without Vite or Chokidar. Use NodeFs polling there to isolate subscription
// and directory recovery behavior; Linux retains its native fs.watch driver.
// The separate native fixtures still exercise macOS's default FSEvents backend.
export function createServer(config) {
  return createViteServer({
    ...config,
    server: {
      ...config.server,
      watch: {
        ...config.server.watch,
        useFsEvents: false,
        usePolling: process.platform === 'darwin',
      },
    },
  });
}
