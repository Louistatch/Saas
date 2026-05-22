import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

// Load E2E-specific env vars
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') })

const baseURL = process.env.BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),
  projects: [
    // Setup project — authenticates all demo accounts
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    // Desktop Chromium
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    // Desktop Firefox
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 13'],
      },
      testMatch: /.*(@mobile|01-navigation|06-verification)\.spec\.ts/,
    },
  ],
  // Web server — only start if testing locally
  webServer: baseURL.includes('localhost') ? {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
})
