import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/web',
    rollupOptions: {
      treeshake: {
        // YAML only initializes its own parser graph, including when the
        // management app imports the source UI barrel directly.
        moduleSideEffects: (id) => !id.includes('/node_modules/yaml/'),
      },
    },
  },
});
