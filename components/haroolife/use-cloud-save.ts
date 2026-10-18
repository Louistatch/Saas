'use client'

import {
  type CityLife,
  decodeCityLife,
  ensureLocality,
  initialCityLife,
} from '@/lib/haroolife/city/life'
/**
 * Keeps the player's game saved online (haroolife_save_get / haroolife_save_put), next to the
 * local save that keeps working offline. On opening, the right copy is chosen (lib/haroolife/
 * cloud-save.ts); while playing, the game is saved every 12–18 s when it changed and when the app is
 * hidden. The server caps the wallet (see supabase/migrations/20261016_120000_haroolife_saves.sql):
 * a capped wallet comes back and replaces the local one. Signed out, or the server unreachable:
 * the local save alone, as before.
 */
import {
  CLOUD_META,
  type CloudCopy,
  type CloudMeta,
  decideOnLoad,
  readMeta,
} from '@/lib/haroolife/cloud-save'
import { useCallback, useEffect, useRef, useState } from 'react'

export type CloudStatus = 'local' | 'syncing' | 'saved' | 'offline'

type PutResult =
  | { ok: true; version: number; updated_at: string; wallet: number; clamped: boolean }
  | { conflict: true; save: unknown; version: number; updated_at: string; wallet: number }

async function supabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

const writeMeta = (m: CloudMeta) => {
  try {
    localStorage.setItem(CLOUD_META, JSON.stringify(m))
  } catch {
    // Storage refused: the online save still works for this visit.
  }
}

export function useCloudSave({
  loaded,
  cityLife,
  adopt,
  notify,
}: {
  /** The local game has been read: the online one can be compared with it. */
  loaded: boolean
  cityLife: CityLife
  /** Replace the game on screen (a newer online game, or a wallet the server capped). */
  adopt: (world: CityLife) => void
  notify: (message: string) => void
}) {
  const [status, setStatus] = useState<CloudStatus>('local')
  const [capped, setCapped] = useState(0)
  const live = useRef(cityLife)
  live.current = cityLife
  const meta = useRef<CloudMeta | null>(null)
  // The signed-in person is a visitor: their game can follow the FaîtiereHub account they create.
  const visitor = useRef(false)
  const ready = useRef(false)
  const dirty = useRef(false)
  const skipNext = useRef(false)
  const busy = useRef<Promise<void> | null>(null)
  const callbacks = useRef({ adopt, notify })
  callbacks.current = { adopt, notify }

  const take = useCallback(
    (copy: { save: unknown; version: number }, user: string, why: string) => {
      const world = decodeCityLife(copy.save)
      if (!world) {
        // Decoding sets the active town: back to the one on screen.
        ensureLocality(live.current)
        return false
      }
      skipNext.current = true
      callbacks.current.adopt(world)
      meta.current = {
        owner: user,
        version: copy.version,
        syncedAt: Date.now(),
        localAt: Date.now(),
        ...(visitor.current ? { visitor: true } : {}),
      }
      writeMeta(meta.current)
      if (why) callbacks.current.notify(why)
      return true
    },
    [],
  )

  const push = useCallback(async () => {
    const m = meta.current
    if (!ready.current || !m) return
    dirty.current = false
    setStatus('syncing')
    const sent = live.current
    const { data, error } = await (await supabase()).rpc('haroolife_save_put', {
      p_save: sent,
      p_version: m.version,
    })
    const r = data as PutResult | null
    if (error || !r || typeof r !== 'object') {
      dirty.current = true
      setStatus('offline')
      return
    }
    if ('conflict' in r) {
      take(r, m.owner, 'Ta partie a été reprise depuis ton autre appareil.')
      setStatus('saved')
      return
    }
    meta.current = { ...m, version: r.version, syncedAt: Date.now() }
    writeMeta(meta.current)
    if (r.clamped) {
      skipNext.current = true
      callbacks.current.adopt({ ...live.current, life: { ...live.current.life, wallet: r.wallet } })
      callbacks.current.notify('Ton solde a été ramené à ce que le serveur reconnaît.')
      setCapped((n) => n + 1)
    }
    setStatus('saved')
  }, [take])

  /** Save now (and wait), e.g. before sending money: the server knows the latest wallet. */
  const flush = useCallback(async () => {
    if (!ready.current) return
    if (busy.current) await busy.current
    busy.current = push().finally(() => {
      busy.current = null
    })
    await busy.current
  }, [push])

  // Opening: compare the online game with this phone's, once the local one is read.
  useEffect(() => {
    if (!loaded) return
    let stop = false
    void (async () => {
      const sb = await supabase()
      const { data: auth } = await sb.auth.getSession()
      const user = auth.session?.user.id
      if (!user || stop) return
      visitor.current = !!auth.session?.user.is_anonymous
      const { data, error } = await sb.rpc('haroolife_save_get')
      if (stop) return
      if (error || (data !== null && (typeof data !== 'object' || Array.isArray(data)))) {
        setStatus('offline')
        return
      }
      let local: string | null = null
      try {
        local = localStorage.getItem(CLOUD_META)
      } catch {
        local = null
      }
      const previous = readMeta(local)
      const cloud = data as CloudCopy | null
      const decision = decideOnLoad(user, previous, cloud)
      meta.current = {
        owner: user,
        version: decision.base,
        syncedAt: previous?.owner === user ? previous.syncedAt : 0,
        localAt: previous?.owner === user ? previous.localAt : 0,
        ...(visitor.current ? { visitor: true } : {}),
      }
      ready.current = true
      if (decision.action === 'adopt-cloud' && cloud && take(cloud, user, '')) {
        setStatus('saved')
        return
      }
      if (decision.action === 'push-fresh') {
        skipNext.current = true
        callbacks.current.adopt(initialCityLife())
      }
      await flush()
    })()
    return () => {
      stop = true
    }
  }, [loaded, take, flush])

  // Every change marks the game to save; the change made by an adoption does not.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new game state, by design
  useEffect(() => {
    if (!ready.current) return
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    dirty.current = true
    if (meta.current) meta.current.localAt = Date.now()
  }, [cityLife])

  useEffect(() => {
    const tick = () => {
      if (dirty.current && !busy.current) void flush()
    }
    // Spread automatic saves after a mass reconnect; explicit flush/hide still saves immediately.
    let id = 0
    let stopped = false
    const schedule = () => {
      id = window.setTimeout(
        () => {
          if (document.visibilityState === 'visible') tick()
          if (!stopped) schedule()
        },
        12_000 + Math.random() * 6000,
      )
    }
    schedule()
    const onHide = () => {
      if (meta.current) writeMeta(meta.current)
      if (document.visibilityState === 'hidden') tick()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      stopped = true
      window.clearTimeout(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush])

  // Probe for the tests.
  useEffect(() => {
    ;(window as unknown as { __LOME_CLOUD?: unknown }).__LOME_CLOUD = {
      status,
      version: meta.current?.version ?? null,
      capped,
    }
  }, [status, capped])

  return { status, flush }
}
