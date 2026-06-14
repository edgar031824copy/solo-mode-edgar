import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:3001',
      '/candidates': {
        target: 'http://localhost:3001',
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) return '/index.html'
        },
      },
      '/health': 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // exclude Playwright e2e specs from Vitest
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
