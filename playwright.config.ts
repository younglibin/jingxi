import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'api.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.API_BASE || 'http://127.0.0.1:18081' },
});
