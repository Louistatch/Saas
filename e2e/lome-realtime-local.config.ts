import { defineConfig } from '@playwright/test'
import local from './lome-engine-regression.config'

// Real isolated SQL relay + mock Auth, no production account or database traffic.
export default defineConfig({
  ...local,
  testMatch: ['lome-realtime.spec.ts', 'lome-engine-regression.spec.ts'],
  webServer: (Array.isArray(local.webServer) ? local.webServer : []).map((server, i, all) =>
    i === all.length - 1
      ? { ...server, env: { ...server.env, NEXT_PUBLIC_HAROOLIFE_ENABLED: 'true' } }
      : server,
  ),
})
