import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.HAROOLIFE_TEST_PORT || 3000)
const baseURL = `http://127.0.0.1:${port}`
const authPort = Number(process.env.HAROOLIFE_SUPABASE_PORT || 54329)
const authURL = `http://127.0.0.1:${authPort}`
const testEnv = {
  NEXT_PUBLIC_SUPABASE_URL: authURL,
  SUPABASE_URL: authURL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role-key',
  HAROOLIFE_ENABLED: 'true',
  FAITIERE_LOCAL_VERIFY: '1',
  NEXT_TELEMETRY_DISABLED: '1',
}

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
    'lome-house-haroo.spec.ts',
    'lome-service-vehicle.spec.ts',
    'lome-place-workflows.spec.ts',
    'lome-entry.spec.ts',
    'lome-farm.spec.ts',
    'lome-objectives.spec.ts',
    'lome-taxi-hud.spec.ts',
    'lome-university.spec.ts',
    'lome-photo.spec.ts',
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
    {
      name: 'firefox-mobile',
      use: {
        browserName: 'firefox',
        viewport: { width: 412, height: 800 },
        hasTouch: true,
        launchOptions: {
          executablePath: process.env.PW_FIREFOX_PATH || undefined,
          headless: process.env.PW_FIREFOX_HEADED !== '1',
          timeout: 30000,
          args: [],
          firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
        },
      },
    },
  ],
  webServer: [
    {
      command: 'node e2e/fixtures/mock-supabase.mjs',
      cwd: '..',
      env: { HAROOLIFE_SUPABASE_PORT: String(authPort) },
      url: `${authURL}/auth/v1/health`,
      reuseExistingServer: process.env.HAROOLIFE_REUSE_SERVER === '1' && !process.env.CI,
    },
    {
      cwd: '..',
      // A leftover BUILD_ID or running server does not prove it contains the current sources.
      // Reuse requires an explicit choice after building this exact checkout.
      command: `${process.env.HAROOLIFE_TEST_USE_BUILD === '1' ? '' : 'npm run build && '}npm run start -- --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/haroolife/territoire/lome`,
      reuseExistingServer: process.env.HAROOLIFE_REUSE_SERVER === '1' && !process.env.CI,
      timeout: 300_000,
      env: testEnv,
    },
  ],
})
