import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { esmExternalRequirePlugin } from 'rolldown/plugins';
import { fileURLToPath } from 'node:url';

const richDependencies = new Set(['mermaid', 'react-markdown', 'remark-gfm']);
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/ui',
    lib: { entry: 'src/ui/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'theme' },
    rollupOptions: {
      // Keep ordinary packages available for final consumer tree-shaking. Rich
      // dependencies retain library-stage compression, without merging modules
      // into the dynamic-entry cycles that produce unused chunks on rebundling.
      external(id, importer) {
        if (
          id === 'react' ||
          id.startsWith('react/') ||
          id === 'react-dom' ||
          id.startsWith('react-dom/')
        )
          return true;
        if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return false;
        return !importer?.split(/[\\/]/).includes('node_modules') && !richDependencies.has(id);
      },
      output: {
        preserveModules: true,
        preserveModulesRoot: fileURLToPath(new URL('./src/ui', import.meta.url)),
        entryFileNames: '[name].js',
      },
      plugins: [
        esmExternalRequirePlugin({
          external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
        }),
      ],
    },
  },
});
