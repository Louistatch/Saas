import { defineConfig } from '@playwright/test'
import local from './lome-captcha.config'

// Auth + real isolated SQL relay; no production account, payment or save is touched.
export default defineConfig({
  ...local,
  testMatch: 'lome-engine-perf.spec.ts',
  projects: local.projects?.filter((p) => p.name !== 'firefox-mobile'),
  timeout: 240_000,
})
