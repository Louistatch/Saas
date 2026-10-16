'use client'

/**
 * « Mon logement » in the phone: the address, the rent and what the advance still covers, the
 * CEET and TdE bills to pay, the landlord's last word, moving to another quartier, and receiving
 * someone at home. The rules and the sources of every price are in lib/haroolife/city/housing.ts.
 */
import {
  type Bill,
  KINDS,
  KIND_IDS,
  type HousingKind,
  QUARTIERS,
  electricityBill,
  housingOf,
  moveInCost,
  nextDue,
  quartierById,
  totalDebt,
  waterBill,
} from '@/lib/haroolife/city/housing'
import type { CityLife } from '@/lib/haroolife/city/life'
import { useState } from 'react'

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

export interface OnlineGuest {
  key: string
  name: string
}

export default function HousingPanel({
  state,
  onPay,
  onMove,
  onReceive,
  online,
  onInvitePlayer,
}: {
  state: CityLife
  onPay: (bill: Bill) => void
  onMove: (quartier: string, kind: HousingKind) => void
  onReceive: (name: string) => void
  /** Players connected in the same town, who can be invited by private message. */
  online: OnlineGuest[]
  onInvitePlayer: (guest: OnlineGuest) => Promise<string>
}) {
  const h = housingOf(state)
  const q = quartierById(h.quartier)
  const [moving, setMoving] = useState(false)
  const [invited, setInvited] = useState<string | null>(null)
  const debt = totalDebt(h)
  const late = h.lateSince !== null && h.debt.rent > 0 ? state.life.day - h.lateSince : 0
  const friends = Object.entries(state.social ?? {})
    .filter(([key, c]) => key.startsWith('npc:') && c.affinity > 0)
    .map(([key]) => key.slice(4))
    .slice(0, 6)

  return (
    <div className="space-y-4" data-testid="housing">
      <section className="rounded-3xl bg-[#3b2f2a] p-4 text-white">
        <p className="text-xs font-semibold text-amber-200">
          {h.evicted ? 'Sans logement' : `${KINDS[h.kind].label} · ${q?.name ?? ''}, Lomé`}
        </p>
        <p className="mt-1 text-lg font-black leading-snug">
          {h.evicted ? 'Le propriétaire a changé la serrure.' : `Loyer ${money(h.rent)} par mois`}
        </p>
        {!h.evicted && (
          <p className="mt-1 text-sm text-amber-100">
            {h.prepaid > 0
              ? `Avance : encore ${h.prepaid} mois payé${h.prepaid > 1 ? 's' : ''}.`
              : 'Plus d’avance : le loyer se paie chaque mois.'}{' '}
            Prochaine échéance : jour {nextDue(h)}. Caution chez le propriétaire :{' '}
            {money(h.caution)}.
          </p>
        )}
      </section>

      {late > 0 && !h.evicted && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {late} jour{late > 1 ? 's' : ''} de retard.{' '}
          {h.step >= 2
            ? 'Le courant est coupé jusqu’au paiement.'
            : 'Le propriétaire frappe au 5ᵉ jour, coupe le courant au 10ᵉ.'}{' '}
          Au 30ᵉ jour, il change la serrure.
        </p>
      )}

      <section aria-label="À payer" className="space-y-2">
        <p className="text-sm font-black text-slate-900">
          {debt > 0 ? `À payer : ${money(debt)}` : 'Tout est payé.'}
        </p>
        {(
          [
            ['rent', 'Payer le loyer', h.debt.rent],
            ['ceet', 'Payer l’électricité (CEET)', h.debt.ceet],
            ['tde', 'Payer l’eau (TdE)', h.debt.tde],
          ] as const
        )
          .filter(([, , amount]) => amount > 0)
          .map(([bill, label, amount]) => (
            <button
              key={bill}
              type="button"
              onClick={() => onPay(bill)}
              disabled={state.life.wallet < amount}
              className="flex w-full items-center justify-between rounded-2xl bg-amber-500 px-4 py-3 text-left text-sm font-black text-white disabled:opacity-50"
            >
              <span>{label}</span>
              <span>{money(amount)}</span>
            </button>
          ))}
        {!h.evicted && (
          <p className="text-[11px] text-slate-500">
            Chaque mois : CEET ≈ {money(electricityBill(h.kind))} ({KINDS[h.kind].kwh} kWh), TdE ≈{' '}
            {money(waterBill(h.kind))}
            {KINDS[h.kind].shared ? ' (ta part du compteur de la cour)' : ''}. Hors TVA.
          </p>
        )}
      </section>

      {!h.evicted && (
        <section aria-label="Recevoir" className="space-y-2 rounded-2xl bg-emerald-50 p-3">
          <p className="text-sm font-black text-slate-900">Inviter quelqu’un chez moi</p>
          <p className="text-xs text-slate-600">
            Le soir, entre 16 h et 23 h : sucreries et causerie, 1 000 FCFA de boissons.
          </p>
          {friends.length === 0 && online.length === 0 && (
            <p className="text-xs text-slate-500">
              Parle d’abord aux habitants du quartier : ceux que tu connais pourront venir.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {friends.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onReceive(name)}
                className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
              >
                Inviter {name}
              </button>
            ))}
            {online.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => void onInvitePlayer(g).then(setInvited)}
                className="rounded-xl border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-800"
              >
                Inviter {g.name} (joueur)
              </button>
            ))}
          </div>
          {invited && (
            <output className="block text-xs font-semibold text-emerald-900">{invited}</output>
          )}
        </section>
      )}

      <section aria-label="Déménager" className="space-y-2">
        <button
          type="button"
          aria-expanded={moving}
          onClick={() => setMoving((m) => !m)}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-bold text-slate-800"
        >
          {h.evicted ? 'Trouver un logement' : 'Déménager'}
        </button>
        {moving && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500">
              À l’entrée : 3 mois de caution (rendue au départ sans dette), 3 mois d’avance et 1
              mois d’agence. La loi (décret 2022-001/PR) plafonne caution et garantie à 3 mois
              chacune ; beaucoup de propriétaires demandent plus.
            </p>
            {QUARTIERS.map((quartier) => (
              <div key={quartier.id} className="rounded-2xl border border-slate-200 p-3">
                <p className="text-sm font-black">{quartier.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {KIND_IDS.map((kind) => {
                    const rent = quartier.rents[kind]
                    const cost = moveInCost(rent.amount)
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => onMove(quartier.id, kind)}
                        aria-label={`Louer ${KINDS[kind].label} à ${quartier.name}`}
                        className="rounded-xl bg-slate-50 p-2 text-left text-xs ring-1 ring-slate-200"
                      >
                        <span className="block font-bold">{KINDS[kind].label}</span>
                        <span className="block">
                          {money(rent.amount)}/mois{rent.observed ? '' : ' (estimé)'}
                        </span>
                        <span className="block text-slate-500">Entrée {money(cost.total)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Loyers relevés dans des annonces de 2023 à 2026, ou estimés d’après les quartiers voisins
        (indiqué). Électricité : tarif CEET de mai 2025. Eau : tarif TdE de 2019. Un mois du jeu
        dure 30 jours du jeu. Argent du jeu uniquement.
      </p>
    </div>
  )
}
