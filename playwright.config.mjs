import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4432',
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'msedge',
    headless: true,
    viewport: { width: 1280, height: 850 },
  },
});
