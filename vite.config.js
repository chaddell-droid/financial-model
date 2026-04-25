import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // fail fast if 5173 is taken instead of silently moving to 5174
    watch: {
      // usePolling fixes vite missing bulk file changes from `git pull` / `git checkout`
      // on Windows. Slightly higher CPU but reliable; well worth it.
      usePolling: true,
      interval: 500,
    },
  },
});
