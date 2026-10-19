import { defineConfig } from '@playwright/test'
import game from './lome-life-playwright.config'

// The arrival checks/claims a username through real SQL in the isolated local relay.
// Starting only the Auth fixture would stop the scenario before it ever reached CAPTCHA.
const port = Number(process.env.HAROOLIFE_TEST_PORT || 3000)
const authPort = Number(process.env.HAROOLIFE_SUPABASE_PORT || 54329)
const servers = Array.isArray(game.webServer) ? game.webServer : []

export default defineConfig({
  ...game,
  testMatch: 'lome-captcha.spec.ts',
  webServer: [
    ...servers.slice(0, 1).map((server) => ({
      ...server,
      env: { ...server.env, HAROOLIFE_LOCAL_RPC_PORT: String(port + 2) },
    })),
    {
      cwd: '..',
      command: 'npm run realtime',
      url: `http://127.0.0.1:${port + 1}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        PORT: String(port + 1),
        HOST: '127.0.0.1',
        HAROOLIFE_REALTIME_REPO: 'pglite',
        HAROOLIFE_REALTIME_ORIGINS: `http://127.0.0.1:${port}`,
        SUPABASE_URL: `http://127.0.0.1:${authPort}`,
        SUPABASE_ANON_KEY: 'fixture-anon-key',
      },
    },
    ...servers.slice(1),
  ],
})
