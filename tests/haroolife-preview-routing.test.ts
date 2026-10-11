import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redirectProductionVercelHost } from '../lib/routing/vercel-canonical-host'

test('preview Vercel domains stay on their preview deployments', () => {
  const preview = 'saas-obv29tmgc-issodo052-7639s-projects.vercel.app'
  assert.equal(redirectProductionVercelHost(preview, 'preview'), false)
  assert.equal(redirectProductionVercelHost(preview, 'development'), false)
  assert.equal(redirectProductionVercelHost(preview, undefined), false)
})

test('production Vercel aliases keep canonical domain redirect', () => {
  assert.equal(redirectProductionVercelHost('saas-one-teal-62.vercel.app', 'production'), true)
  assert.equal(
    redirectProductionVercelHost('saas-issodo052-7639s-projects.vercel.app', 'production'),
    true,
  )
})

test('canonical hosts and deceptive suffixes are not redirected', () => {
  assert.equal(redirectProductionVercelHost('www.faitierehub.com', 'production'), false)
  assert.equal(redirectProductionVercelHost('faitierehub.com', 'production'), false)
  assert.equal(redirectProductionVercelHost('fake.vercel.app.attacker.test', 'production'), false)
})
