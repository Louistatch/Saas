import assert from 'node:assert/strict'
import { it } from 'node:test'
import { supabaseAdapters } from '../realtime/supabase'

it('isolates concurrent RPCs by the supplied user token, translates errors and bounds outstanding requests', async () => {
  const seen: string[] = []
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const adapter = supabaseAdapters('https://fixture.supabase.co', 'fixture-anon', {
    maxRequests: 2,
    fetch: async (_input, init) => {
      assert.ok(init?.signal)
      const token = new Headers(init?.headers).get('Authorization') ?? ''
      seen.push(token)
      await held
      if (token.endsWith('expired'))
        return Response.json({ code: 'PGRST301', message: 'expired JWT' }, { status: 401 })
      return Response.json({ key: token, rooms: [], blocked: [] })
    },
  })
  const a = adapter.chat.me('ama')
  const b = adapter.chat.me('yawa')
  await assert.rejects(adapter.chat.me('extra'), { code: 'unavailable' })
  assert.equal(seen.length, 2)
  release()
  assert.equal((await a).key, 'Bearer ama')
  assert.equal((await b).key, 'Bearer yawa')
  await assert.rejects(adapter.chat.me('expired'), { code: 'auth_expired' })
})

it('uses signed JWKS for identity, rejects forged/expired/foreign claims and never trusts metadata for roles', async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  }
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = async (overrides = {}) => {
    const head = b64({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    const body = b64({
      sub: 'a1a1a1a1-0000-4000-8000-000000000001',
      iss: 'https://fixture.supabase.co/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      app_metadata: { role: 'super_admin' },
      ...overrides,
    })
    const signed = `${head}.${body}`
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(signed),
    )
    return `${signed}.${Buffer.from(signature).toString('base64url')}`
  }
  let userRequests = 0
  const adapter = supabaseAdapters('https://fixture.supabase.co', 'fixture-anon', {
    claims: true,
    fetch: async (input) => {
      if (String(input).endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] })
      if (String(input).endsWith('/rest/v1/rpc/haroolife_chat_me'))
        return Response.json({
          key: 'verified-public-key',
          name: 'Ama',
          pagne: 0,
          rooms: [],
          blocked: [],
          can_write: false,
        })
      userRequests++
      return Response.json({ message: 'unexpected auth request' }, { status: 401 })
    },
  })
  const valid = await token()
  assert.deepEqual(await adapter.auth.verify(valid), {
    userId: 'a1a1a1a1-0000-4000-8000-000000000001',
  })
  assert.equal((await adapter.chat.me(valid)).can_write, false)
  for (const t of [
    await token({ iss: 'https://attacker.example/auth/v1' }),
    await token({ aud: 'service_role' }),
    await token({ exp: 1 }),
    `${valid.slice(0, -12)}AAAAAAAAAAAA`,
  ])
    assert.equal(await adapter.auth.verify(t), null)
  assert.equal(userRequests, 0, 'no Auth /user call for asymmetric tokens')
})
