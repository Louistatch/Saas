import { defineConfig } from '@playwright/test'
import local from './lome-realtime-local.config'

export default defineConfig({
  ...local,
  testMatch: [
    'lome-public-services.spec.ts',
    'lome-civic.spec.ts',
    'lome-engine-regression.spec.ts',
  ],
  timeout: 240_000,
})
