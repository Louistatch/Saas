import { defineConfig } from '@playwright/test'
import local from './lome-realtime-local.config'

export default defineConfig({
  ...local,
  testMatch: [
    'lome-interface.spec.ts',
    'lome-engine-regression.spec.ts',
    'lome-map-native.spec.ts',
    'lome-daily-actions.spec.ts',
    'lome-service-vehicle.spec.ts',
  ],
})
