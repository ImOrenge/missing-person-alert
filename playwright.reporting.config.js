const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: ['reporting-refactor-local.spec.js', 'global-shell-local.spec.js'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'artifacts/reporting-refactor/playwright-results',
  use: {
    baseURL: 'https://localhost:3000',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm start --prefix frontend',
    url: 'https://localhost:3000',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { BROWSER: 'none', PORT: '3000' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
