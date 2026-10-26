import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 60000, workers: 2,
  use: { baseURL: 'http://127.0.0.1:8010', headless: true,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {} },
  webServer: { command: 'python3 tests/serve.py 8010', url: 'http://127.0.0.1:8010', reuseExistingServer: !process.env.CI },
});
