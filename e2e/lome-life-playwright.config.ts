import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './',
  testMatch: 'lome-life.spec.ts',
  reporter: [['list'],['html',{outputFolder:'test-results/lome-report',open:'never'}]],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {timeout:20_000},
  use: {
    baseURL: 'http://127.0.0.1:3000',
    launchOptions: {
      args: ['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'mobile-android',use:{...devices['Pixel 7'],viewport:{width:412,height:915}}},
  ],
  webServer: {
    command:'npm run dev -- --hostname 127.0.0.1',
    url:'http://127.0.0.1:3000/haroolife/territoire/lome',
    reuseExistingServer:!process.env.CI,
    timeout:180_000,
  },
})
