import { createServer as createViteServer } from 'vite';
export * from 'vite';

// Exercise the production SourceWatcher with Vite's real alternate backend.
export function createServer(config) {
  return createViteServer({
    ...config,
    server: {
      ...config.server,
      watch: { ...config.server.watch, useFsEvents: false, usePolling: false },
    },
  });
}
