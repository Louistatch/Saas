import { defineConfig, devices } from '@playwright/test'

// AgriAcademy contre le mock Supabase et un serveur `next start` déjà lancé sur 127.0.0.1:3000.
export default defineConfig({
  testDir: './',
  testMatch: ['academy.spec.ts'],
  reporter: [['list'], ['html', { outputFolder: 'test-results/academy-report', open: 'never' }]],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
    bypassCSP: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
