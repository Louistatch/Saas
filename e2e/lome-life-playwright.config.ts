import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.HAROOLIFE_TEST_PORT || 3000)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './',
  testMatch: [
    'lome-map-native.spec.ts',
    'lome-life.spec.ts',
    'lome-presence.spec.ts',
    'lome-city.spec.ts',
    'lome-world-life.spec.ts',
    'lome-perf.spec.ts',
    'lome-cooperative.spec.ts',
    'lome-gpu-lifecycle.spec.ts',
    'lome-travel.spec.ts',
    'lome-player.spec.ts',
    'lome-avatar.spec.ts',
    'lome-door.spec.ts',
    'lome-realtime.spec.ts',
    'lome-billboard.spec.ts',
    'lome-endurance.spec.ts',
    'lome-interior-three.spec.ts',
  ],
  reporter: [['list'], ['html', { outputFolder: 'test-results/lome-report', open: 'never' }]],
  fullyParallel: false,
  workers: 1,
  timeout: 160_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    launchOptions: {
      // Cloud sessions ship Chromium at this path; a local Playwright install may override it.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: [
        '--enable-webgl',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // Two players = two pages; each stands for a phone in the foreground, so neither may be
        // throttled as a background tab (the realtime spec animates both at once).
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } },
    },
  ],
  webServer: {
    command: `[ -f .next/BUILD_ID ] || npm run build; npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/haroolife/territoire/lome`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
