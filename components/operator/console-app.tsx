'use client'

// Console de validation installable : installation sur l'écran d'accueil, alertes push et
// résumé « ce qui se passe ». Tout est facultatif : sans support du navigateur, la page
// fonctionne comme avant.
import { Bell, BellOff, Download, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Insight = { level: 'urgent' | 'attention' | 'info'; text: string; link: string }
interface Activity {
  dossiers: { pending: number; new_24h: number; oldest_days: number } | null
  haroolife: {
    cooperative: string | null
    canton: string | null
    workers_available: number
    groups_open: number
    groups_ready: number
  } | null
  insights: Insight[]
  events: { id: number; title: string; body: string; link: string; created_at: string }[]
}
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const LEVEL_STYLE: Record<Insight['level'], string> = {
  urgent: 'border-l-red-600 bg-red-50 text-red-950',
  attention: 'border-l-amber-500 bg-amber-50 text-amber-950',
  info: 'border-l-emerald-600 bg-emerald-50 text-emerald-950',
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function since(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 60) return `il y a ${Math.max(minutes, 1)} min`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`
}

export function ConsoleApp() {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  const [pushState, setPushState] = useState<'unsupported' | 'off' | 'on' | 'denied' | 'busy'>(
    'unsupported',
  )
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/activity', { cache: 'no-store' })
      setActivity(res.ok ? ((await res.json()) as Activity) : null)
    } catch {
      setActivity(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    setStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    )
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    if ('serviceWorker' in navigator && 'PushManager' in window && VAPID) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (Notification.permission === 'denied') setPushState('denied')
          else setPushState(sub ? 'on' : 'off')
        })
        .catch(() => setPushState('unsupported'))
    }
    const timer = window.setInterval(() => void load(), 120_000)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.clearInterval(timer)
    }
  }, [load])

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }

  async function enablePush() {
    setPushState('busy')
    setNotice('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID),
        }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error('subscribe')
      setPushState('on')
      setNotice('Alertes activées sur cet appareil.')
    } catch {
      setPushState('off')
      setNotice('Activation impossible. Réessayez depuis l’application installée.')
    }
  }

  async function disablePush() {
    setPushState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushState('off')
      setNotice('Alertes désactivées sur cet appareil.')
    } catch {
      setPushState('on')
    }
  }

  return (
    <section aria-label="Ce qui se passe" className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!standalone && installEvent && (
          <button
            type="button"
            onClick={() => void install()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <Download aria-hidden="true" className="h-4 w-4" /> Installer sur ce téléphone
          </button>
        )}
        {pushState === 'off' && (
          <button
            type="button"
            onClick={() => void enablePush()}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-900 px-4 py-2 text-sm font-semibold text-emerald-900"
          >
            <Bell aria-hidden="true" className="h-4 w-4" /> Recevoir les alertes
          </button>
        )}
        {pushState === 'on' && (
          <button
            type="button"
            onClick={() => void disablePush()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            <BellOff aria-hidden="true" className="h-4 w-4" /> Couper les alertes
          </button>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" /> Actualiser
        </button>
      </div>
      {!standalone && ios && (
        <p className="text-sm text-slate-600">
          Sur iPhone : touchez Partager puis « Sur l’écran d’accueil » pour installer la console et
          recevoir les alertes.
        </p>
      )}
      {pushState === 'denied' && (
        <p className="text-sm text-amber-800">
          Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du
          navigateur pour recevoir les alertes.
        </p>
      )}
      <output aria-live="polite" className="block text-sm text-emerald-900">
        {notice}
      </output>

      {activity && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border bg-white p-3">
              <p className="text-2xl font-bold">{activity.dossiers?.pending ?? '—'}</p>
              <p className="text-xs text-slate-600">dossiers à valider</p>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="text-2xl font-bold">{activity.dossiers?.new_24h ?? '—'}</p>
              <p className="text-xs text-slate-600">reçus en 24 h</p>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="text-2xl font-bold">
                {activity.haroolife
                  ? activity.haroolife.groups_open + activity.haroolife.groups_ready
                  : '—'}
              </p>
              <p className="text-xs text-slate-600">groupes HarooLife actifs</p>
            </div>
          </div>
          {activity.insights.length > 0 ? (
            <ul className="space-y-2">
              {activity.insights.map((i) => (
                <li key={i.text}>
                  <Link
                    href={i.link}
                    className={`block rounded-lg border-l-4 px-4 py-3 text-sm ${LEVEL_STYLE[i.level]}`}
                  >
                    {i.text}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              Rien d’urgent : tout est à jour dans votre périmètre.
            </p>
          )}
          {activity.events.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Derniers événements</h2>
              <ul className="divide-y rounded-xl border bg-white">
                {activity.events.map((e) => (
                  <li key={e.id} className="px-4 py-3 text-sm">
                    <Link href={e.link} className="block">
                      <span className="font-medium">{e.title}</span>{' '}
                      <span className="text-slate-500">{since(e.created_at)}</span>
                      <span className="block text-slate-600">{e.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
