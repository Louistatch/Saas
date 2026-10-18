import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { RealtimeClient } from '../lib/haroolife/realtime/client'
import { RepoError, createRealtime } from '../realtime/core'
import { LOCAL_ACCOUNTS } from '../realtime/pglite'
import { memoryWorlds } from '../realtime/worlds'
import {
  type Client,
  connect,
  delay,
  event,
  fixtureAuth,
  fixtureChat,
  relayUrl,
  tokenFor,
} from './helpers/realtime-fixture'

const until = async (test: () => boolean) => {
  const end = Date.now() + 6000
  while (!test()) {
    if (Date.now() > end) assert.fail('Client state did not settle')
    await delay(20)
  }
}

describe('real browser client protocol and lifecycle', { timeout: 20_000 }, () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let relay: ReturnType<typeof createRealtime>
  let player: RealtimeClient
  let other: Client
  let otherKey = ''
  let refuseNextWrite = false
  before(async () => {
    const chat = await fixtureChat()
    const events = new EventTarget()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        setTimeout,
        clearTimeout,
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
      },
    })
    const worlds = memoryWorlds()
    relay = createRealtime({
      auth: fixtureAuth,
      chat: {
        ...chat,
        async send(...args) {
          if (refuseNextWrite) {
            refuseNextWrite = false
            throw new RepoError('unavailable', 'Transient overload')
          }
          return chat.send(...args)
        },
      },
      origins: [],
      worlds: {
        ...worlds,
        async join(id, locality, entry) {
          if (locality === 'lome') await delay(120)
          return worlds.join(id, locality, entry)
        },
      },
    })
    await relay.listen(0, '127.0.0.1')
    other = connect(relayUrl(relay), 'yawa')
    otherKey = (await event(other, 'system:hello')).me.key
    await other.timeout(3000).emitWithAck('presence:join', { locality: 'kara' })
    player = new RealtimeClient(relayUrl(relay), async () => tokenFor(LOCAL_ACCOUNTS.ama.id))
    await player.start()
    await until(() => player.snapshot().status === 'online')
  })
  after(async () => {
    player?.stop()
    other?.disconnect()
    await relay?.close()
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  it('serializes rapid travel and never adopts an old city response after the player moves on', async () => {
    const slow = player.join('lome')
    await delay(30)
    await player.join('kara')
    await slow
    assert.equal(player.snapshot().present.length, 1)
    assert.equal(player.snapshot().present[0].locality, 'kara')
    assert.equal(player.snapshot().present[0].name, 'Yawa (test)')
  })

  it('keeps public unread badges without streaming bodies, and ignores a blocked author', async () => {
    const send = (body: string) =>
      other
        .timeout(4000)
        .emitWithAck('chat:send', { v: 1, room: 'world:togo', body, clientId: crypto.randomUUID() })
    assert.ok((await send('Bonjour')).ok)
    await until(() => player.snapshot().unread['world:togo'] === 1)
    assert.equal(player.snapshot().rooms['world:togo']?.length ?? 0, 0)
    assert.equal(await player.blockPlayer(otherKey), null)
    player.read('world:togo')
    await delay(100)
    player.read(null)
    assert.ok((await send('Auteur désormais bloqué')).ok)
    await delay(1500)
    assert.equal(player.snapshot().unread['world:togo'], 0)
  })

  it('stopping during a pending token read leaves no transport or connecting state behind', async () => {
    let resolve: (value: string) => void = () => {}
    const c = new RealtimeClient(
      relayUrl(relay),
      () =>
        new Promise<string>((r) => {
          resolve = r
        }),
    )
    const opening = c.start()
    c.stop()
    resolve(tokenFor(LOCAL_ACCOUNTS.ama.id))
    await opening
    assert.equal(c.snapshot().status, 'idle')
    assert.equal(c.diagnostics().connected, false)
  })
  it('retries an overloaded database without reconnecting or losing the queued message', async () => {
    refuseNextWrite = true
    assert.equal(player.send('world:togo', 'Retry the same client ID'), null)
    await until(() => player.snapshot().outbox.some((m) => m.state === 'queued'))
    await until(() => player.snapshot().outbox.length === 0)
    assert.equal(
      player.snapshot().rooms['world:togo'].filter((m) => m.body === 'Retry the same client ID')
        .length,
      1,
    )
    assert.equal(player.diagnostics().connected, true)
  })
})
