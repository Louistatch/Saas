/**
 * Global Setup — Authenticates all demo accounts before tests run.
 * Saves browser storage state to .auth/ directory for reuse.
 */

import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { ACCOUNTS, ROUTES } from './helpers/constants'

const AUTH_DIR = path.resolve(__dirname, '.auth')

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000'

  // Ensure .auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
  }

  const browser = await chromium.launch()

  for (const [name, account] of Object.entries(ACCOUNTS)) {
    const stateFile = path.resolve(__dirname, account.storageState)

    // Skip if state file already exists and is recent (< 1 hour old)
    if (fs.existsSync(stateFile)) {
      const stats = fs.statSync(stateFile)
      const ageMs = Date.now() - stats.mtimeMs
      if (ageMs < 60 * 60 * 1000) {
        console.log(`  ✓ ${name}: reusing cached auth state`)
        continue
      }
    }

    console.log(`  → Authenticating ${name} (${account.email})...`)

    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()

    try {
      await page.goto(ROUTES.login, { waitUntil: 'networkidle', timeout: 60_000 })

      // Fill login form — use specific selectors
      await page.locator('#email').fill(account.email)
      await page.locator('#password').fill(account.password)
      await page.getByRole('button', { name: /Se connecter|Connexion/ }).click()

      // Wait for redirect (indicates successful auth)
      const expectedPath = account.role === 'super_admin' ? '/admin' : '/dashboard'
      await page.waitForURL(`**${expectedPath}**`, { timeout: 30_000 })

      // Save storage state
      await context.storageState({ path: stateFile })
      console.log(`  ✓ ${name}: authenticated and state saved`)
    } catch (error) {
      console.error(`  ✗ ${name}: authentication failed —`, (error as Error).message)
      // Create empty state file so tests can still run (they'll fail on auth-required pages)
      fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
    } finally {
      await context.close()
    }
  }

  await browser.close()
  console.log('\n✓ Global setup complete — all accounts authenticated\n')
}

export default globalSetup
