import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { componentActions } from './src/compiler/component-library.ts';

export default defineConfig({
  plugins: [
    componentActions({
      entry: fileURLToPath(new URL('./src/ui/index.ts', import.meta.url)),
      packageRoot: fileURLToPath(new URL('.', import.meta.url)),
      outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
      emit: false,
    }),
    react(),
    tailwindcss(),
  ],
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
