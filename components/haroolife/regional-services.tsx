'use client'
import { airTrip, atAirport } from '@/lib/haroolife/city/aviation'
import {
  EMPLOYERS,
  employerLot,
  employmentOf,
  startHourlyShift,
  stopHourlyShift,
} from '@/lib/haroolife/city/employment'
import type { CityLife } from '@/lib/haroolife/city/life'
import { LOCALITIES, LOCALITY_IDS, type LocalityId } from '@/lib/haroolife/city/locality'
import type { Lot } from '@/lib/haroolife/city/world'
import type { RealtimeSnapshot } from '@/lib/haroolife/realtime/client'

export function EmploymentPanel({
  state,
  onChange,
  onGo,
}: {
  state: CityLife
  onChange: (reduce: (s: CityLife) => CityLife) => void
  onGo: (lot: Lot) => void
}) {
  const employment = employmentOf(state)
  return (
    <section
      className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4"
      aria-label="Emplois à l’heure"
    >
      <h3 className="font-black">Un service au kiosque</h3>
      <p className="text-xs text-slate-600">
        Missions fictives dans HarooLife, sans recrutement réel ni partenariat avec les marques. 7
        h–19 h · jusqu’à 4 h par jour. Une heure de jeu dure 11 secondes au premier plan.
      </p>
      {EMPLOYERS.map((e) => {
        const lot = employerLot(e.id)
        const inside = !!lot && state.insideLot === lot.id
        const active = employment.shift?.employer === e.id
        return (
          <article
            key={e.id}
            className="space-y-2 rounded-xl bg-white p-3"
            data-testid={`employer-${e.id}`}
          >
            <h4 className="text-sm font-black">
              {e.icon} {e.name} · {e.hourlyRate.toLocaleString('fr-FR')} FCFA/h
            </h4>
            <p className="text-xs text-slate-600">{e.task}</p>
            {active ? (
              <>
                <output className="block text-xs font-bold text-emerald-800">
                  En service · {employment.shift?.hours} heure(s) payée(s). Versement automatique à
                  chaque heure complète.
                </output>
                <button
                  type="button"
                  onClick={() => onChange(stopHourlyShift)}
                  className="min-h-11 rounded-xl border px-3 text-sm font-bold"
                >
                  Terminer le service
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!lot || !!employment.shift}
                onClick={() =>
                  inside ? onChange((s) => startHourlyShift(s, e.id)) : lot && onGo(lot)
                }
                className="min-h-11 rounded-xl bg-sky-800 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {inside ? `Commencer chez ${e.name}` : `Rejoindre ${e.name}`}
              </button>
            )}
          </article>
        )
      })}
      <output className="block text-xs" aria-live="polite">
        {state.life.lastEvent}
      </output>
      <p className="text-xs text-slate-500">
        {employment.day === state.life.day ? employment.hoursToday : 0}/4 h aujourd’hui ·{' '}
        {employment.earned.toLocaleString('fr-FR')} FCFA gagnés au kiosque. Sortir interrompt le
        service ; aucune rémunération hors ligne.
      </p>
    </section>
  )
}

export function AviationPanel({
  state,
  onFly,
}: { state: CityLife; onFly: (to: LocalityId) => void }) {
  const routes = LOCALITY_IDS.filter((id) => airTrip(state.locality, id))
  if (!routes.length) return null
  return (
    <section aria-label="Aviation HarooLife" className="space-y-2 rounded-2xl bg-sky-50 p-4">
      <h3 className="font-black">✈️ Lomé ↔ Niamtougou · liaison Kara</h3>
      <p className="text-xs text-slate-600">
        Vol fictif du jeu, navette Kara–Niamtougou incluse. Aucun billet réel n’est vendu. Rejoins
        le terminal, embarque et retrouve ton personnage dans la ville d’arrivée.
      </p>
      {routes.map((id) => {
        const t = airTrip(state.locality, id)
        if (!t) return null
        return (
          <button
            key={id}
            type="button"
            onClick={() => onFly(id)}
            className="min-h-11 w-full rounded-xl bg-sky-900 px-3 py-3 text-sm font-bold text-white"
          >
            {atAirport(state) ? `Embarquer vers ${LOCALITIES[id].name}` : 'Rejoindre le terminal'} ·{' '}
            {t.fare.toLocaleString('fr-FR')} FCFA · {t.hours} h
          </button>
        )
      })}
    </section>
  )
}

export function OnlinePlayers({
  state,
  locality,
  onPlayer,
}: { state: RealtimeSnapshot; locality: LocalityId; onPlayer: (key: string) => void }) {
  const connected = state.status === 'online'
  const players = state.present.filter((p) => p.locality === locality && p.key !== state.me?.key)
  return (
    <section aria-label="Joueurs en ligne" className="space-y-3">
      <p className="text-sm text-slate-600">
        {connected
          ? `Connectés maintenant à ${LOCALITIES[locality].name}. Touche une personne pour ouvrir son profil et lui écrire en privé.`
          : 'Connexion au direct indisponible. Aucun statut en ligne ne peut être confirmé.'}
      </p>
      {connected && state.me && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold">🟢 {state.me.name} · toi</p>
      )}
      {connected &&
        players.map((p) => (
          <button
            type="button"
            key={p.key}
            onClick={() => onPlayer(p.key)}
            className="flex min-h-14 w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left text-sm"
          >
            <span>
              🟢 <strong>{p.name}</strong>
              <span className="block text-xs text-slate-500">
                En ligne · {LOCALITIES[locality].name}
              </span>
            </span>
            <span className="font-bold text-emerald-700">Écrire →</span>
          </button>
        ))}
      {connected && !players.length && (
        <p className="text-sm text-slate-500">
          Tu es le seul joueur connecté dans cette ville pour le moment. Les passants du jeu sont
          des PNJ.
        </p>
      )}
    </section>
  )
}
