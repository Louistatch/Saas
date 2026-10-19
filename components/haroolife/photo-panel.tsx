'use client'

/**
 * « Photo » in the phone: a picture of the game as it is on screen (the 3D scene only, without
 * the menus), with a band naming the place and the player's invite link, shared on WhatsApp
 * through the phone's share sheet, or saved when the browser cannot share an image.
 */
import { inviteLink } from '@/lib/haroolife/invite'
import { useEffect, useRef, useState } from 'react'

/** The game's 3D canvas: the largest visible canvas of the game screen. */
function gameCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null
  let area = 0
  for (const c of document.querySelectorAll<HTMLCanvasElement>('main.haroolife-screen canvas')) {
    const r = c.getBoundingClientRect()
    if (r.width * r.height > area && c.width > 0 && c.height > 0) {
      best = c
      area = r.width * r.height
    }
  }
  return best
}

/** True when the copy is empty: the drawing buffer had already been cleared. */
function blank(img: HTMLImageElement): boolean {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const g = c.getContext('2d')
  if (!g) return false
  g.drawImage(img, 0, 0, 16, 16)
  const d = g.getImageData(0, 0, 16, 16).data
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 0) return false
  return true
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const load = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })

/**
 * Copy the scene right after the renderer drew it: in the animation frame following the
 * renderer's own, the WebGL drawing buffer still holds the image. A frame the renderer skipped
 * gives an empty copy: a few more frames are tried.
 */
async function snapshot(canvas: HTMLCanvasElement): Promise<HTMLImageElement | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await frame()
    let url = ''
    try {
      url = canvas.toDataURL('image/png')
    } catch {
      return null
    }
    const img = await load(url)
    if (img && !blank(img)) return img
  }
  return null
}

/** The shared picture: the scene, then a band with the place and the link. */
function compose(scene: HTMLImageElement, place: string, link: string | null): HTMLCanvasElement {
  const width = Math.min(1080, scene.naturalWidth)
  const h = Math.round((scene.naturalHeight * width) / scene.naturalWidth)
  const band = Math.round(width * 0.16)
  const out = document.createElement('canvas')
  out.width = width
  out.height = h + band
  const g = out.getContext('2d')
  if (!g) return out
  g.drawImage(scene, 0, 0, width, h)
  g.fillStyle = '#14532d'
  g.fillRect(0, h, width, band)
  const pad = Math.round(width * 0.045)
  g.fillStyle = '#ffffff'
  g.font = `900 ${Math.round(band * 0.3)}px system-ui, sans-serif`
  g.textBaseline = 'top'
  g.fillText(`HarooLife · ${place}`, pad, h + band * 0.16, width - pad * 2)
  g.fillStyle = '#bbf7d0'
  g.font = `600 ${Math.round(band * 0.19)}px system-ui, sans-serif`
  g.fillText(
    link ? `Viens jouer avec moi : ${link.replace(/^https?:\/\//, '')}` : 'Viens jouer avec moi',
    pad,
    h + band * 0.6,
    width - pad * 2,
  )
  return out
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'))

export default function PhotoPanel({ place }: { place: string }) {
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [state, setState] = useState<'taking' | 'ready' | 'failed'>('taking')
  const [link, setLink] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: one photo per opening
  useEffect(() => {
    let alive = true
    void (async () => {
      // The invite link, when the player has one (a photo still works without it).
      let shared: string | null = null
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const { data } = await createClient().rpc('haroolife_invite_code')
        const code = (data as { code?: string } | null)?.code
        if (code) shared = inviteLink(window.location.origin, code)
      } catch {
        // No link: the band only invites to play.
      }
      const canvas = gameCanvas()
      const scene = canvas ? await snapshot(canvas) : null
      if (!alive) return
      setLink(shared)
      if (!scene) {
        setState('failed')
        return
      }
      const blob = await toBlob(compose(scene, place, shared))
      if (!alive) return
      if (!blob) {
        setState('failed')
        return
      }
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setPhoto({ blob, url })
      setState('ready')
    })()
    return () => {
      alive = false
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const text = link
    ? `Je joue à HarooLife, la vie à ${place}. Viens jouer avec moi : ${link}`
    : `Je joue à HarooLife, la vie à ${place}.`
  const file = photo ? new File([photo.blob], 'haroolife.png', { type: 'image/png' }) : null
  const canShareFile =
    !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  function save() {
    if (!photo) return
    const a = document.createElement('a')
    a.href = photo.url
    a.download = 'haroolife.png'
    a.click()
  }
  async function share() {
    if (!file) return
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], text })
        setSaid('Photo partagée.')
      } catch {
        // Share sheet closed: nothing to say.
      }
      return
    }
    // No image sharing here: the photo is saved, WhatsApp opens with the message and the link.
    save()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    setSaid('Photo enregistrée : ajoute-la dans la conversation WhatsApp qui vient de s’ouvrir.')
  }

  return (
    <div className="space-y-3" data-testid="photo">
      {state === 'taking' && <p className="text-sm text-slate-500">Photo en cours…</p>}
      {state === 'failed' && (
        <p role="alert" className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          La photo n’a pas pu être prise sur cet appareil. Ferme le téléphone, puis réessaie.
        </p>
      )}
      {photo && (
        <>
          <img
            src={photo.url}
            alt={`Le jeu à ${place}`}
            data-testid="photo-preview"
            className="w-full rounded-2xl border border-slate-200 shadow"
          />
          <button
            type="button"
            onClick={() => void share()}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#1f9d55] px-4 text-base font-black text-white"
          >
            Partager sur WhatsApp
          </button>
          <button
            type="button"
            onClick={save}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800"
          >
            Enregistrer la photo
          </button>
          {said && (
            <output className="block rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              {said}
            </output>
          )}
        </>
      )}
    </div>
  )
}
