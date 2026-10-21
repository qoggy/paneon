import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/ui',
    lib: { entry: 'src/ui/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'theme' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'] },
  },
});
