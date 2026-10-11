'use client'

import { DISTRICT_SCENES, visualSignals } from '@/lib/haroolife/territory-scene'
import {
  type HubId,
  type TerritoryWorld,
  UPGRADES,
  type UpgradeId,
} from '@/lib/haroolife/territory-simulation'
import { ChevronLeft, ChevronRight, Eye, EyeOff, RotateCcw, Sparkles } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const World3D = dynamic(() => import('./territory-world-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-emerald-100">
      Création du monde 3D…
    </div>
  ),
})

type Capability = 'checking' | 'ready' | 'limited' | 'unsupported'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value) + ' FCFA'

export function Territory3DPanel({
  hub,
  world,
  onInvest,
  onAdvance,
}: {
  hub: HubId
  world: TerritoryWorld
  onInvest: (type: UpgradeId) => void
  onAdvance: () => void
}) {
  const [capability, setCapability] = useState<Capability>('checking')
  const [enabled, setEnabled] = useState(false)
  const [angle, setAngle] = useState(45)
  const [selectedAsset, setSelectedAsset] = useState<UpgradeId>('factory')
  const scene = DISTRICT_SCENES[hub]
  const state = visualSignals(hub, world)
  const asset = UPGRADES[selectedAsset]

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const hasWebGL = Boolean(canvas.getContext('webgl2'))
      if (!hasWebGL) {
        setCapability('unsupported')
        return
      }
      const navigatorInfo = navigator as Navigator & {
        deviceMemory?: number
        connection?: { saveData?: boolean }
      }
      const limited =
        navigatorInfo.connection?.saveData === true ||
        (navigatorInfo.deviceMemory !== undefined && navigatorInfo.deviceMemory < 4)
      setCapability(limited ? 'limited' : 'ready')
      setEnabled(!limited)
    } catch {
      setCapability('unsupported')
    }
  }, [])

  return (
    <section
      aria-label="Monde 3D HarooLife"
      className="overflow-hidden rounded-3xl border border-emerald-900/20 bg-[#0d2723] text-white shadow-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            HarooLife · Exploration 3D
          </p>
          <h2 className="text-2xl font-bold sm:text-3xl">
            {hub === 'kpalime'
              ? 'Kpalimé'
              : hub === 'lome'
                ? 'Lomé'
                : hub === 'kara'
                  ? 'Kara'
                  : hub === 'sokode'
                    ? 'Sokodé'
                    : 'Dapaong'}{' '}
            — {scene.title}
          </h2>
          <p className="text-sm text-emerald-100">{scene.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-700/70 px-3 py-1.5 font-medium">
            Jour {world.day}
          </span>
          <span className="rounded-full border border-emerald-500/30 px-3 py-1.5">
            Quartier stylisé
          </span>
        </div>
      </div>

      <div className="relative mx-3 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#618b91] via-[#8cb2a7] to-[#4d7659] sm:mx-5">
        {enabled && capability !== 'unsupported' ? (
          <div className="h-[310px] w-full sm:h-[440px] lg:h-[520px]">
            <World3D hub={hub} world={world} heading={angle} onPick={setSelectedAsset} />
          </div>
        ) : (
          <div className="flex h-[310px] flex-col items-center justify-center gap-3 px-5 text-center sm:h-[440px]">
            <EyeOff aria-hidden="true" className="h-8 w-8 text-white/75" />
            {capability === 'checking' ? (
              <p>Vérification des capacités graphiques…</p>
            ) : capability === 'unsupported' ? (
              <>
                <p className="font-semibold">WebGL2 n'est pas disponible dans ce navigateur.</p>
                <p className="max-w-md text-sm">
                  La carte interactive et la simulation économique fonctionnent sans la scène 3D.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Mode léger activé pour économiser les ressources.</p>
                <p className="max-w-md text-sm">
                  La vue 3D peut consommer davantage de données et de batterie sur Android.
                </p>
                <button
                  type="button"
                  onClick={() => setEnabled(true)}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-950"
                >
                  <Eye aria-hidden="true" className="mr-2 inline h-4 w-4" /> Charger le monde 3D
                </button>
              </>
            )}
          </div>
        )}
        {enabled && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-[#071e1b]/85 px-3 py-2 text-[11px] text-white/95">
            Modèles de démonstration · Géographie non reproduite à l'échelle
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!enabled}
            onClick={() => setAngle((value) => (value + 315) % 360)}
            aria-label="Faire pivoter la caméra vers la gauche"
            className="rounded-lg border border-emerald-400/30 bg-white/10 p-3 hover:bg-white/20 disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={!enabled}
            onClick={() => setAngle((value) => (value + 45) % 360)}
            aria-label="Faire pivoter la caméra vers la droite"
            className="rounded-lg border border-emerald-400/30 bg-white/10 p-3 hover:bg-white/20 disabled:opacity-40"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={!enabled}
            onClick={() => setAngle(45)}
            aria-label="Rétablir l'angle de caméra initial"
            className="rounded-lg border border-emerald-400/30 bg-white/10 p-3 hover:bg-white/20 disabled:opacity-40"
          >
            <RotateCcw aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {capability !== 'unsupported' && capability !== 'checking' && (
          <button
            type="button"
            onClick={() => setEnabled((value) => !value)}
            className="rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-100"
          >
            {enabled ? 'Passer en mode léger' : 'Afficher la 3D'}
          </button>
        )}
        <button
          type="button"
          onClick={onAdvance}
          className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-200"
        >
          Simuler +1 jour
        </button>
      </div>

      <div className="border-t border-white/15 bg-[#09201d] p-4 sm:p-6">
        {state.canDevelop ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                  Construire dans le quartier
                </p>
                <p className="text-sm text-emerald-100">
                  Sélectionne un bâtiment, une parcelle ou une option ci-dessous.
                </p>
              </div>
              <Sparkles aria-hidden="true" className="h-5 w-5 text-emerald-300" />
            </div>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              aria-label="Choix d'équipement 3D"
            >
              {(['factory', 'irrigation', 'truck', 'solar'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selectedAsset === id}
                  onClick={() => setSelectedAsset(id)}
                  className={
                    selectedAsset === id
                      ? 'rounded-xl border border-emerald-300 bg-emerald-700 px-3 py-3 text-left text-sm font-semibold text-white'
                      : 'rounded-xl border border-white/20 bg-white/5 px-3 py-3 text-left text-sm text-emerald-50 hover:bg-white/15'
                  }
                >
                  {UPGRADES[id].title}
                  {world.projects[id] && (
                    <span className="mt-1 block text-xs text-emerald-200">Construit</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-white/10 p-3">
              <div>
                <p className="font-semibold">{asset.title}</p>
                <p className="text-xs text-emerald-100">{asset.detail}</p>
              </div>
              <button
                type="button"
                disabled={world.projects[selectedAsset] || world.treasury < asset.cost}
                onClick={() => onInvest(selectedAsset)}
                className="rounded-lg bg-emerald-300 px-4 py-3 text-sm font-bold text-emerald-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/70"
              >
                {world.projects[selectedAsset]
                  ? 'Déjà construit'
                  : world.treasury < asset.cost
                    ? 'Budget insuffisant'
                    : 'Construire · ' + currency(asset.cost)}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Exploration disponible</p>
            <p className="text-emerald-100">
              Cette ville possède une scène 3D représentative. Les investissements restent
              disponibles seulement dans le scénario Kpalimé → Lomé. Choisis Kpalimé sur la carte
              pour construire.
            </p>
            {state.delivered && (
              <p className="font-semibold text-emerald-300">
                Des livraisons simulées ont atteint le marché de Lomé.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
