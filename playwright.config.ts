import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './src/test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  outputDir: 'output/e2e/artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: 'output/e2e/playwright-report.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
