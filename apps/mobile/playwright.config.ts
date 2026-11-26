import { defineConfig } from '@playwright/test';

const webUrl = process.env.WEB_URL || 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e-web',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: webUrl,
    headless: true,
    trace: 'off',
  },
});
