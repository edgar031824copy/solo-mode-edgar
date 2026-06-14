import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  // Servers are already started manually before running tests.
  // reuseExistingServer: true ensures Playwright won't try to start them again.
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      port: 3001,
      reuseExistingServer: true,
      env: { ...process.env },
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
