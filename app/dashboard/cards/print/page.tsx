'use client'

import { useCooperative } from '@/app/context/cooperative-context'
import { LoadingBlock } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { type CardSchema, PLATFORM_LOGO_PATH, renderCardSvg } from '@/lib/card-engine'
import { CARDS_PER_SHEET, SHEET, cellTrimOrigin, cropMarksPath } from '@/lib/card-engine/sheet'
import { createClient } from '@/lib/supabase/client'
import {
  type CardImageContext,
  type LogoAssets,
  loadLogoAssets,
  loadMemberLevels,
  schemaForCard,
  toBrandingOrgs,
} from '@/lib/utils/card-image'
import type { CardTemplate, MemberCard } from '@/types/domain'
import { ArrowLeft, Printer } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Feuilles A4 de cartes de membre, à imprimer à l'échelle réelle, d'un seul
 * côté de la feuille (la carte n'a qu'une face).
 *
 * Chaque carte fait exactement 85,6 × 54 mm, avec 3 mm de fond perdu et des
 * repères de coupe dans la gouttière (voir lib/card-engine/sheet.ts). La page
 * d'impression est un nœud à part, rendu sous <body> : en impression, tout le
 * reste de l'application (menu, en-tête, marges de la mise en page) disparaît,
 * rien ne décale donc les cartes ni ne met la feuille à l'échelle.
 */
export default function PrintCardsPage() {
  const { currentCooperative, cooperatives } = useCooperative()
  const supabase = useMemo(() => createClient(), [])
  const [cards, setCards] = useState<MemberCard[]>([])
  const [savedTemplate, setSavedTemplate] = useState<CardTemplate | null>(null)
  const [levels, setLevels] = useState<ReadonlyMap<string, 'or' | 'argent' | 'bronze'>>(new Map())
  const [assets, setAssets] = useState<LogoAssets>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [marks, setMarks] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const fetchCards = useCallback(async () => {
    if (!currentCooperative) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)

    let query = supabase
      .from('member_cards')
      .select(
        '*, member:members(first_name, last_name, phone, photo_url, signature_url, prefecture, region, village, canton, faitiere)',
      )
      .eq('status', 'active')
      // Cartes de membre uniquement : les cartes Haroo ont leur propre rendu.
      .eq('card_type', 'FAITIERE')

    // For faitiere/union: load cards from all child cooperatives
    if (currentCooperative.level === 'faitiere' || currentCooperative.level === 'union') {
      const { data: childCoops } = await supabase
        .from('cooperatives')
        .select('id')
        .or(`id.eq.${currentCooperative.id},parent_id.eq.${currentCooperative.id}`)
      const childIds = (childCoops ?? []).map((c) => c.id)
      if (childIds.length > 0) {
        const { data: grandChildCoops } = await supabase
          .from('cooperatives')
          .select('id')
          .in('parent_id', childIds)
        const allIds = [...new Set([...childIds, ...(grandChildCoops ?? []).map((c) => c.id)])]
        query = query.in('cooperative_id', allIds)
      } else {
        query = query.eq('cooperative_id', currentCooperative.id)
      }
    } else {
      query = query.eq('cooperative_id', currentCooperative.id)
    }

    query = query.order('created_at', { ascending: false })
    const [{ data }, { data: settings }] = await Promise.all([
      query,
      supabase
        .from('cooperative_settings')
        .select('card_template')
        .eq('cooperative_id', currentCooperative.id)
        .maybeSingle<{ card_template: CardTemplate | null }>(),
    ])
    setCards((data ?? []) as MemberCard[])
    setSavedTemplate(settings?.card_template ?? null)
    setIsLoading(false)
  }, [currentCooperative, supabase])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  const orgs = useMemo(() => toBrandingOrgs(cooperatives), [cooperatives])

  const contexts = useMemo<CardImageContext[]>(
    () =>
      cards.map((card) => ({
        card,
        orgs,
        fallbackOrganisationId: currentCooperative?.id ?? null,
        savedTemplates:
          savedTemplate && currentCooperative
            ? { [currentCooperative.id]: savedTemplate }
            : undefined,
        level: levels.get(card.member_id) ?? null,
      })),
    [cards, orgs, currentCooperative, savedTemplate, levels],
  )

  // Niveaux réels et logos mesurés : chargés en arrière-plan, la feuille se
  // complète d'elle-même (un membre sans niveau affiche « — »).
  useEffect(() => {
    if (cards.length === 0) return
    let cancelled = false
    loadMemberLevels(cards.map((c) => c.member_id)).then((m) => {
      if (!cancelled) setLevels(m)
    })
    return () => {
      cancelled = true
    }
  }, [cards])

  useEffect(() => {
    if (cards.length === 0) return
    let cancelled = false
    loadLogoAssets(
      cards.map((card) => ({ card, orgs, fallbackOrganisationId: currentCooperative?.id ?? null })),
    ).then((a) => {
      if (!cancelled) setAssets(a)
    })
    return () => {
      cancelled = true
    }
  }, [cards, orgs, currentCooperative])

  const schemas = useMemo(() => contexts.map((c) => schemaForCard(c, assets)), [contexts, assets])

  const sheetCount = Math.max(1, Math.ceil(schemas.length / CARDS_PER_SHEET))

  if (isLoading) return <LoadingBlock />

  const sheets = (idSuffix: string, limit?: number) =>
    Array.from({ length: limit ? Math.min(limit, sheetCount) : sheetCount }).map((_, s) => (
      <A4Sheet
        // biome-ignore lint/suspicious/noArrayIndexKey: une feuille est identifiée par son rang
        key={s}
        schemas={schemas.slice(s * CARDS_PER_SHEET, (s + 1) * CARDS_PER_SHEET)}
        index={s}
        total={sheetCount}
        marks={marks}
        idSuffix={idSuffix}
      />
    ))

  return (
    <div className="min-h-screen bg-white">
      {/* Contrôles (masqués à l'impression) */}
      <div className="print:hidden sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard/cards">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          </Link>
          <div className="text-sm text-gray-500">
            {cards.length} carte{cards.length !== 1 ? 's' : ''} · {sheetCount} page
            {sheetCount !== 1 ? 's' : ''} A4
          </div>
          <Button onClick={() => window.print()} className="gap-2" disabled={cards.length === 0}>
            <Printer className="h-4 w-4" /> Imprimer en PDF
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2" htmlFor="print-marks">
            <input
              id="print-marks"
              type="checkbox"
              checked={marks}
              onChange={(e) => setMarks(e.target.checked)}
            />
            Repères de coupe
          </label>
        </div>
        <p className="text-xs text-gray-500 max-w-3xl">
          Dans la fenêtre d'impression : papier A4, échelle 100 % (« taille réelle », pas « ajuster
          à la page »), marges « aucune », impression sur une seule face. Les cartes mesurent
          exactement 85,6 × 54 mm.
        </p>
      </div>

      {/* Aperçu écran : les deux premières feuilles, à l'échelle réelle, défilement horizontal si besoin */}
      <div className="print:hidden overflow-x-auto bg-gray-100 p-4">
        <div className="mx-auto flex w-fit flex-col gap-6">
          {cards.length === 0 ? (
            <p className="rounded-md bg-white p-8 text-sm text-gray-500">
              Aucune carte active à imprimer.
            </p>
          ) : (
            sheets('-ap', 1)
          )}
        </div>
        {sheetCount > 1 ? (
          <p className="mt-3 text-center text-xs text-gray-500">
            Aperçu de la première feuille ; les {sheetCount} feuilles sont imprimées.
          </p>
        ) : null}
      </div>

      {/* Feuilles d'impression : nœud sous <body>, seul visible à l'impression */}
      {mounted && cards.length > 0
        ? createPortal(
            <div id="card-print-root" aria-hidden="true">
              {sheets('-pr')}
            </div>,
            document.body,
          )
        : null}

      <style jsx global>{`
        @page { size: A4 portrait; margin: 0; }
        #card-print-root { display: none; }
        .card-sheet { position: relative; width: ${SHEET.pageWidth}mm; height: ${SHEET.pageHeight - 1}mm; overflow: hidden; background: #fff; }
        .card-sheet-screen { box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25); }
        .card-cell > svg { display: block; width: 100%; height: 100%; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
          body > *:not(#card-print-root) { display: none !important; }
          #card-print-root { display: block; }
          .card-sheet { break-after: page; page-break-after: always; box-shadow: none; }
          .card-sheet:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}

function A4Sheet({
  schemas,
  index,
  total,
  marks,
  idSuffix,
}: {
  schemas: CardSchema[]
  index: number
  total: number
  marks: boolean
  idSuffix: string
}) {
  const cells = useMemo(
    () =>
      schemas.map((schema, i) => ({
        key: `${schema.member.cardNumber}-${i}`,
        origin: cellTrimOrigin(i),
        // SVG inséré dans la page : le logo FaîtiereHub se charge par son URL.
        svg: renderCardSvg(schema, {
          mode: 'print',
          bleed: true,
          platformLogo: PLATFORM_LOGO_PATH,
          idSuffix: `${idSuffix}`,
        }),
      })),
    [schemas, idSuffix],
  )
  const markPaths = useMemo(
    () => (marks ? cells.map((c) => cropMarksPath(c.origin)).join('') : ''),
    [cells, marks],
  )

  return (
    <section
      className={`card-sheet ${idSuffix === '-ap' ? 'card-sheet-screen' : ''}`}
      aria-label={`Feuille ${index + 1} sur ${total}`}
    >
      {cells.map((cell) => (
        <div
          key={cell.key}
          className="card-cell"
          style={{
            position: 'absolute',
            left: `${cell.origin.x - SHEET.bleed}mm`,
            top: `${cell.origin.y - SHEET.bleed}mm`,
            width: `${SHEET.trimWidth + SHEET.bleed * 2}mm`,
            height: `${SHEET.trimHeight + SHEET.bleed * 2}mm`,
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG produit par renderCardSvg, qui échappe chaque interpolation (esc dans lib/card-engine/security-art.ts)
          dangerouslySetInnerHTML={{ __html: cell.svg }}
        />
      ))}
      {marks ? (
        <svg
          viewBox={`0 0 ${SHEET.pageWidth} ${SHEET.pageHeight}`}
          width={`${SHEET.pageWidth}mm`}
          height={`${SHEET.pageHeight}mm`}
          style={{ position: 'absolute', left: 0, top: 0 }}
          aria-hidden="true"
        >
          <path d={markPaths} fill="none" stroke="#000" strokeWidth="0.1" />
        </svg>
      ) : null}
      <p
        style={{
          position: 'absolute',
          left: '8mm',
          top: '6mm',
          margin: 0,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '7pt',
          color: '#555',
        }}
      >
        Feuille {index + 1}/{total} · une face · 100 % · 85,6 × 54 mm
      </p>
    </section>
  )
}
