import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { esmExternalRequirePlugin } from 'rolldown/plugins';
import { fileURLToPath } from 'node:url';
import { componentActions } from './src/compiler/component-library.ts';

const richDependencies = new Set(['mermaid', 'react-markdown', 'remark-gfm', 'yaml']);
export default defineConfig({
  plugins: [
    componentActions({
      entry: fileURLToPath(new URL('./src/ui/index.ts', import.meta.url)),
      packageRoot: fileURLToPath(new URL('.', import.meta.url)),
      outDir: fileURLToPath(new URL('./dist/ui', import.meta.url)),
    }),
    react(),
    tailwindcss(),
    {
      name: 'yaml-browser-module-metadata',
      generateBundle() {
        // YAML's initialization only wires its own exported parser classes.
        // Preserve that boundary after preserveModules so consumers that do
        // not use Markdown can drop the complete browser parser graph.
        this.emitFile({
          type: 'asset',
          fileName: 'node_modules/yaml/package.json',
          source: '{"type":"module","sideEffects":false}\n',
        });
      },
    },
  ],
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
