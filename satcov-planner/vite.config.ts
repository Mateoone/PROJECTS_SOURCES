import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cesium()],
  server: { port: 5174 },
  worker: { format: 'es' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
});
