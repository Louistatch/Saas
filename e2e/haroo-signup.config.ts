import { defineConfig } from '@playwright/test'
import base from './seo.config'

const servers = Array.isArray(base.webServer) ? base.webServer : []
export default defineConfig({
  ...base,
  testMatch: 'haroo-signup.spec.ts',
  webServer: [
    {
      cwd: '..',
      command: 'node e2e/fixtures/haroo-registration.mjs',
      url: 'http://127.0.0.1:54377/health',
      reuseExistingServer: false,
    },
    ...servers.map((server) => ({
      ...server,
      env: {
        ...server.env,
        AGRITOGO_API_URL: 'http://127.0.0.1:54377',
        REQUIRE_EMAIL_CONFIRMATION: 'false',
        UPSTASH_REDIS_REST_URL: '',
      },
    })),
  ],
})
