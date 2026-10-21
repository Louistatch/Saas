import { defineConfig, devices } from '@playwright/test'

// Consoles PAYG contre le mock Supabase et un serveur `next start` déjà lancé sur 127.0.0.1:3000
// (même montage que AgriAcademy). Mobile d'abord : les agents travaillent au téléphone.
export default defineConfig({
  testDir: './',
  testMatch: ['payg.spec.ts'],
  reporter: [['list'], ['html', { outputFolder: 'test-results/payg-report', open: 'never' }]],
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
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
