'use client'

/**
 * « Aménager » : the furniture shop (buy, then place in the house, store, resell) and the bar
 * shown while a piece is being placed in the room. The rules are pure (city/furnishing.ts for
 * the money and the save, game/core/furnish.ts for where a piece may stand); this file holds the
 * React state of a placing in progress and the buttons.
 */
import {
  CATEGORY_NAMES,
  FURNITURE,
  type FurnitureCategory,
  RESALE,
  buyFurniture,
  furnishingOf,
  furnitureItem,
  isPlaced,
  placePiece,
  resellPiece,
  storePiece,
} from '@/lib/haroolife/city/furnishing'
import type { CityLife } from '@/lib/haroolife/city/life'
import { canPlace, freeSpotNear, placedFurniture } from '@/lib/haroolife/game/core/furnish'
import type { PlacingGhost } from '@/lib/haroolife/game/render/room-world'
import { useEffect, useMemo, useState } from 'react'

const money = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`
const snap = (v: number) => Math.round(v * 4) / 4
type Reduce = (reduce: (s: CityLife) => CityLife) => void

/**
 * The placing in progress and what the house view needs: the furniture to draw (the piece being
 * moved is hidden at its old spot) and the preview.
 */
export function useHomeFurnishing({
  state,
  onChange,
  inHouse,
  onNotice,
  closePanel,
}: {
  state: CityLife
  onChange: Reduce
  /** Inside the player's own house, where the furniture stands. */
  inHouse: boolean
  onNotice: (message: string) => void
  closePanel: () => void
}) {
  const [placing, setPlacing] = useState<{ uid: string; x: number; z: number; rot: number } | null>(
    null,
  )
  const pieces = furnishingOf(state).pieces
  useEffect(() => {
    if (!inHouse) setPlacing(null)
  }, [inHouse])
  const furniture = useMemo(
    () => (inHouse ? placedFurniture(pieces.filter((p) => p.uid !== placing?.uid)) : []),
    [inHouse, pieces, placing?.uid],
  )
  const piece = placing ? pieces.find((p) => p.uid === placing.uid) : undefined
  const item = piece ? furnitureItem(piece.item) : undefined
  const check = placing ? canPlace(pieces, placing.uid, placing.x, placing.z, placing.rot) : null
  const ghost: PlacingGhost | null =
    placing && item
      ? {
          url: item.url,
          scale: item.scale,
          x: placing.x,
          z: placing.z,
          rotation: (placing.rot * Math.PI) / 2,
          valid: check?.ok ?? false,
        }
      : null

  const start = (uid: string) => {
    if (!inHouse) {
      onNotice('Rentre chez toi pour installer ce meuble : Maison, puis Rentrer chez moi.')
      return
    }
    const p = pieces.find((x) => x.uid === uid)
    if (!p) return
    const rot = p.rot ?? 0
    const at = freeSpotNear(pieces, uid, p.x ?? 0, p.z ?? 0.5, rot)
    closePanel()
    setPlacing({ uid, x: at.x, z: at.z, rot })
  }
  const bar =
    placing && item && check ? (
      <PlacementBar
        name={item.name}
        reason={check.ok ? null : check.reason}
        onRotate={() => setPlacing((o) => o && { ...o, rot: (o.rot + 1) % 4 })}
        onConfirm={() => {
          if (!check.ok) return
          onChange((s) => placePiece(s, placing.uid, placing.x, placing.z, placing.rot))
          setPlacing(null)
        }}
        onCancel={() => setPlacing(null)}
      />
    ) : null
  return {
    home: {
      furniture,
      placing: ghost,
      onFloorTap: (p: { x: number; z: number }) =>
        setPlacing((o) => o && { ...o, x: snap(p.x), z: snap(p.z) }),
    },
    start,
    bar,
  }
}

function PlacementBar({
  name,
  reason,
  onRotate,
  onConfirm,
  onCancel,
}: {
  name: string
  reason: string | null
  onRotate: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <section
      aria-label={`Placer : ${name}`}
      data-testid="placement-bar"
      className="pointer-events-auto fixed inset-x-3 bottom-[max(92px,calc(env(safe-area-inset-bottom)+88px))] z-[60] mx-auto max-w-md rounded-3xl bg-white/95 p-3 shadow-xl ring-1 ring-slate-200"
    >
      <p className="text-sm font-black text-slate-900">{name}</p>
      <output
        aria-live="polite"
        className={`mt-0.5 block text-xs font-semibold ${reason ? 'text-red-700' : 'text-emerald-700'}`}
      >
        {reason ?? 'Ici, ça rentre. Touche le sol pour le déplacer.'}
      </output>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onRotate}
          className="min-h-11 rounded-xl border border-slate-200 text-sm font-bold"
        >
          Tourner
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-200 text-sm font-bold"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={Boolean(reason)}
          onClick={onConfirm}
          className="min-h-11 rounded-xl bg-emerald-700 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          Poser ici
        </button>
      </div>
    </section>
  )
}

/** The catalogue, then the pieces already bought. */
export function FurnitureShop({
  state,
  onChange,
  onPlace,
}: {
  state: CityLife
  onChange: Reduce
  onPlace: (uid: string) => void
}) {
  const wallet = state.life.wallet
  const owned = furnishingOf(state).pieces
  const categories = Object.keys(CATEGORY_NAMES) as FurnitureCategory[]
  return (
    <div className="space-y-4" data-testid="furniture-shop">
      <div className="rounded-2xl bg-sky-50 p-4">
        <h3 className="font-black">🛋️ Meubles et électroménager</h3>
        <p className="mt-1 text-sm text-slate-600">
          Achète, puis installe chez toi : touche le sol de ta maison pour choisir la place. Prix
          indicatifs relevés dans les boutiques de Lomé, pas des devis.
        </p>
        <p className="mt-2 text-sm font-bold">{money(wallet)} disponibles</p>
      </div>
      {owned.length > 0 && (
        <section aria-label="Chez moi" className="space-y-2">
          <h4 className="text-sm font-black">Chez moi · {owned.length}</h4>
          {owned.map((p) => {
            const item = furnitureItem(p.item)
            if (!item) return null
            return (
              <article
                key={p.uid}
                data-testid={`piece-${p.uid}`}
                className="rounded-2xl border border-slate-100 bg-white p-3"
              >
                <p className="text-sm font-bold">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {isPlaced(p) ? 'Installé dans ta maison' : 'Dans son carton'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onPlace(p.uid)}
                    className="min-h-10 flex-1 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white"
                  >
                    {isPlaced(p) ? 'Déplacer' : 'Installer'}
                  </button>
                  {isPlaced(p) && (
                    <button
                      type="button"
                      onClick={() => onChange((s) => storePiece(s, p.uid))}
                      className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                    >
                      Ranger
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange((s) => resellPiece(s, p.uid))}
                    className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                  >
                    Revendre · {money(Math.round((item.price * RESALE) / 500) * 500)}
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}
      {categories.map((c) => (
        <section key={c} aria-label={CATEGORY_NAMES[c]} className="space-y-2">
          <h4 className="text-sm font-black">{CATEGORY_NAMES[c]}</h4>
          {FURNITURE.filter((f) => f.category === c).map((item) => (
            <article
              key={item.id}
              data-testid={`furniture-${item.id}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{item.name}</p>
                <p className="text-xs text-slate-500">{item.hint}</p>
              </div>
              <button
                type="button"
                disabled={wallet < item.price}
                onClick={() => onChange((s) => buyFurniture(s, item.id))}
                className="min-h-11 shrink-0 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white disabled:bg-slate-100 disabled:text-slate-400"
              >
                Acheter · {money(item.price)}
              </button>
            </article>
          ))}
        </section>
      ))}
      <output
        aria-live="polite"
        className="block rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900"
      >
        {state.life.lastEvent}
      </output>
    </div>
  )
}
