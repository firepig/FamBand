import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/famband/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/famband/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/famband/, '') },
      // Uploaded images are served by Express, not Vite.
      '/famband/photos': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/famband/, '') },
      '/famband/avatars': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/famband/, '') },
      '/famband/quests': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/famband/, '') },
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
