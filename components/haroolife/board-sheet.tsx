'use client'

import { rentBoard, reportBoard } from '@/lib/haroolife/ads/board-client'
/**
 * The sheet of a billboard nobody rents (« Panneau disponible ») or rented by a player: rent it
 * with game money and write what it says, or read a player's notice and report it. The rules
 * and the wallet check are the database's (lib/haroolife/ads/rental.ts says which).
 */
import type { AdCampaign, AdPlacement } from '@/lib/haroolife/ads/campaigns'
import { drawPoster } from '@/lib/haroolife/ads/poster'
import {
  BOARD_PALETTES,
  BODY_MAX,
  type BoardPost,
  RENT_OPTIONS,
  REPORT_REASONS,
  type RentHours,
  TITLE_MAX,
  postFace,
  postIdOf,
  rentProblem,
  untilSaid,
} from '@/lib/haroolife/ads/rental'
import { uuid } from '@/lib/haroolife/realtime/client'
import { useEffect, useRef, useState } from 'react'

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

export default function BoardSheet({
  focus,
  posts,
  wallet,
  beforeRent,
  onRented,
  onClose,
}: {
  focus: { placement: AdPlacement; campaign: AdCampaign }
  /** Live posts of this town (to know whether the player already rents one). */
  posts: BoardPost[]
  wallet: number
  /** Saves the game online first: the server checks the wallet it knows. */
  beforeRent: () => Promise<void>
  onRented: (post: BoardPost, price: number, duplicate: boolean) => void
  onClose: () => void
}) {
  const { placement, campaign } = focus
  const postId = postIdOf(campaign)
  const post = postId ? (posts.find((p) => p.id === postId) ?? null) : null
  return post ? (
    <PostView post={post} placement={placement} onClose={onClose} />
  ) : (
    <RentForm
      placement={placement}
      mine={posts.find((p) => p.mine) ?? null}
      wallet={wallet}
      beforeRent={beforeRent}
      onRented={onRented}
      onClose={onClose}
    />
  )
}

function Preview({ face, label }: { face: AdCampaign; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawPoster(ref.current, face)
  }, [face])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="aspect-[16/9] w-full rounded-xl shadow-inner ring-4 ring-slate-700"
    />
  )
}

function RentForm({
  placement,
  mine,
  wallet,
  beforeRent,
  onRented,
  onClose,
}: {
  placement: AdPlacement
  mine: BoardPost | null
  wallet: number
  beforeRent: () => Promise<void>
  onRented: (post: BoardPost, price: number, duplicate: boolean) => void
  onClose: () => void
}) {
  const [hours, setHours] = useState<RentHours>(24)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [palette, setPalette] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const client = useRef<string | null>(null)
  const price = RENT_OPTIONS.find((o) => o.hours === hours)?.price ?? RENT_OPTIONS[0].price
  const problem = title || body ? rentProblem(title, body) : null
  const now = new Date()
  const face = postFace({
    id: 'apercu',
    placement: placement.id,
    title: title.trim() || 'Ton titre ici',
    body: body.trim() || 'Ton information : une vente, une fête, une annonce du quartier…',
    palette,
    author: 'toi',
    mine: true,
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + hours * 3600e3).toISOString(),
  })

  async function rent() {
    const why = rentProblem(title, body)
    if (why) {
      setError(why)
      return
    }
    if (wallet < price) {
      setError(`Il te manque ${money(price - wallet)} pour cette location.`)
      return
    }
    setBusy(true)
    setError(null)
    client.current ??= uuid()
    await beforeRent()
    const r = await rentBoard({
      placement: placement.id,
      hours,
      title,
      body,
      palette,
      clientId: client.current,
    })
    setBusy(false)
    if ('error' in r) {
      setError(r.error)
      return
    }
    client.current = null
    onRented(r.post, r.price, r.duplicate)
  }

  return (
    <div className="space-y-4" data-testid="board-rent">
      <div>
        <p className="text-lg font-black text-slate-900">Panneau disponible</p>
        <p className="text-sm text-slate-600">{placement.label}</p>
      </div>
      {mine ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          Tu loues déjà un panneau, {untilSaid(mine.endsAt)} : un seul à la fois.
        </p>
      ) : (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-800">Durée</legend>
            <div className="grid grid-cols-2 gap-2">
              {RENT_OPTIONS.map((o) => (
                <label
                  key={o.hours}
                  className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-xl border-2 px-3 py-2 text-sm ${hours === o.hours ? 'border-orange-600 bg-orange-50 text-orange-950' : 'border-slate-200 text-slate-700'}`}
                >
                  <input
                    type="radio"
                    name="board-hours"
                    className="sr-only"
                    checked={hours === o.hours}
                    onChange={() => setHours(o.hours)}
                  />
                  <span className="font-black">{o.label}</span>
                  <span>{money(o.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-bold text-slate-800">
            Titre
            <input
              aria-label="Titre"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Maïs frais à Bè"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-normal"
            />
            <span className="mt-1 block text-right text-xs font-normal text-slate-500">
              {title.length}/{TITLE_MAX}
            </span>
          </label>
          <label className="block text-sm font-bold text-slate-800">
            Ton information
            <textarea
              aria-label="Ton information"
              value={body}
              maxLength={BODY_MAX}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Je vends mon maïs, passe au marché samedi matin."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-normal"
            />
            <span className="mt-1 block text-right text-xs font-normal text-slate-500">
              {body.length}/{BODY_MAX}
            </span>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-800">Couleurs</legend>
            <div className="flex gap-3">
              {BOARD_PALETTES.map(([bg, , accent], i) => (
                <label key={bg} className="cursor-pointer">
                  <input
                    type="radio"
                    name="board-palette"
                    className="peer sr-only"
                    checked={palette === i}
                    onChange={() => setPalette(i)}
                    aria-label={`Couleurs ${i + 1}`}
                  />
                  <span
                    className="block h-11 w-11 rounded-full ring-2 ring-slate-200 peer-checked:ring-4 peer-checked:ring-orange-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                    style={{ background: `linear-gradient(135deg, ${bg} 60%, ${accent} 60%)` }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <Preview face={face} label={`Aperçu du panneau : ${face.creative.title}`} />
          <p className="text-xs text-slate-500">
            Pas de numéro de téléphone, de lien ni d’e-mail. Tout le quartier le lit : un panneau
            signalé par trois joueurs est masqué, l’équipe décide ensuite. Argent du jeu uniquement.
          </p>
          {(error ?? problem) && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-900"
            >
              {error ?? problem}
            </p>
          )}
          <p className="text-sm text-slate-700">
            Ton argent : <strong>{money(wallet)}</strong>
          </p>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {!mine && (
          <button
            type="button"
            onClick={rent}
            disabled={busy || wallet < price || Boolean(problem) || !title || !body}
            className="min-h-12 rounded-2xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-40"
          >
            {busy ? 'Location…' : `Louer pour ${money(price)}`}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`min-h-12 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 ${mine ? 'col-span-2' : ''}`}
        >
          Retour au jeu
        </button>
      </div>
    </div>
  )
}

function PostView({
  post,
  placement,
  onClose,
}: {
  post: BoardPost
  placement: AdPlacement
  onClose: () => void
}) {
  const [reporting, setReporting] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [bg, fg, accent] = postFace(post).creative.palette
  async function report(reason: string) {
    const r = await reportBoard(post.id, reason)
    setReporting(false)
    setSaid(
      'error' in r
        ? r.error
        : r.hidden
          ? 'Merci. Plusieurs joueurs l’ont signalé : le panneau est masqué, l’équipe va regarder.'
          : 'Merci, ton signalement est envoyé à l’équipe.',
    )
  }
  return (
    <div className="space-y-4" data-testid="board-post">
      <div
        className="relative overflow-hidden rounded-2xl p-5"
        style={{ background: bg, color: fg }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-2"
          style={{ background: accent }}
        />
        <p className="text-xs font-bold opacity-80">Annonce de {post.author}</p>
        <p className="mt-2 text-xl font-black">{post.title}</p>
        <p className="mt-1 text-sm opacity-90">{post.body}</p>
      </div>
      <p className="text-xs text-slate-500">
        {placement.label}. Panneau loué par un joueur avec l’argent du jeu, {untilSaid(post.endsAt)}
        . Ce n’est pas une publicité de FaîtiereHub.
      </p>
      {post.mine ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          C’est ton panneau : tout le quartier le voit en passant.
        </p>
      ) : said ? (
        <output className="block rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{said}</output>
      ) : reporting ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-slate-800">Pourquoi le signaler ?</legend>
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => report(r.id)}
              className="block min-h-11 w-full rounded-xl border border-slate-200 px-3 text-left text-sm text-slate-800"
            >
              {r.label}
            </button>
          ))}
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {!post.mine && !said && !reporting && (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="min-h-12 rounded-2xl border border-rose-200 px-4 text-sm font-bold text-rose-800"
          >
            Signaler
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`min-h-12 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 ${post.mine || said || reporting ? 'col-span-2' : ''}`}
        >
          Retour au jeu
        </button>
      </div>
    </div>
  )
}
