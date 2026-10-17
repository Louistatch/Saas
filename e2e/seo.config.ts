import { defineConfig, devices } from '@playwright/test'

const port = 3211
const authPort = 54376
const supabase = `http://127.0.0.1:${authPort}`

export default defineConfig({
  testDir: '.',
  testMatch: 'seo.spec.ts',
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium' },
  },
  webServer: [
    {
      cwd: '..',
      command: 'node e2e/fixtures/mock-supabase.mjs',
      url: `${supabase}/auth/v1/health`,
      env: { HAROOLIFE_SUPABASE_PORT: String(authPort) },
      reuseExistingServer: false,
    },
    {
      cwd: '..',
      command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabase,
        SUPABASE_URL: supabase,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role-key',
        FAITIERE_LOCAL_VERIFY: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
})
