import { defineConfig } from '@playwright/test'
import local from './lome-engine-perf.config'

const port = Number(process.env.HAROOLIFE_TEST_PORT || 3000)
const servers = Array.isArray(local.webServer) ? local.webServer : []
export default defineConfig({
  ...local,
  testMatch: [
    'lome-engine-regression.spec.ts',
    'lome-door.spec.ts',
    'lome-taxi-hud.spec.ts',
    'lome-service-vehicle.spec.ts',
    'lome-daily-actions.spec.ts',
    'lome-civic.spec.ts',
  ],
  webServer: servers.map((server, i) =>
    i === servers.length - 1
      ? {
          ...server,
          env: {
            ...server.env,
            NEXT_PUBLIC_HAROOLIFE_REALTIME_URL: `http://127.0.0.1:${port + 1}`,
          },
        }
      : server,
  ),
})
