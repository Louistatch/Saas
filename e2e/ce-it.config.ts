import { defineConfig } from '@playwright/test'
import base from './lome-life-playwright.config'

export default defineConfig({
  ...base,
  testMatch: 'ce-it.spec.ts',
  timeout: 60000,
  projects: base.projects?.filter((p) => p.name !== 'firefox-mobile'),
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((s, i) =>
    i === 1 ? { ...s, env: { ...s.env, CE_IT_MODULE_ENABLED: 'true' } } : s,
  ),
})
