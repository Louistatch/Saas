'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { LoadingBlock } from '@/components/shared/loading'
import { buildCardSchema, renderToSvgString } from '@/lib/card-engine'
import Link from 'next/link'
import type { MemberCard } from '@/types/domain'

/**
 * Print page: displays member cards for A4 printing.
 * Uses the SVG card renderer for pixel-perfect output.
 * 2 cards per row, 4 rows per page = 8 cards per A4.
 */
export default function PrintCardsPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [cards, setCards] = useState<MemberCard[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchCards = useCallback(async () => {
    if (!currentCooperative) return
    setIsLoading(true)
    let query = supabase
      .from('member_cards')
      .select('*, member:members(first_name, last_name, phone, photo_url, prefecture, region, village, canton, faitiere)')
      .eq('status', 'active')
      .eq('cooperative_id', currentCooperative.id)
    query = query.order('created_at', { ascending: false })
    const { data } = await query
    setCards((data ?? []) as MemberCard[])
    setIsLoading(false)
  }, [currentCooperative, supabase, user])

  useEffect(() => { fetchCards() }, [fetchCards])

  const handlePrint = () => window.print()

  if (isLoading) return <LoadingBlock />

  return (
    <div className="min-h-screen bg-white">
      {/* Controls (hidden when printing) */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard/cards">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
        </Link>
        <div className="text-sm text-gray-500">
          {cards.length} carte{cards.length !== 1 ? 's' : ''} • {Math.ceil(cards.length / 4)} page{Math.ceil(cards.length / 4) !== 1 ? 's' : ''} A4
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" /> Imprimer en PDF
        </Button>
      </div>

      {/* A4 Pages — 4 cards per page (2 cols × 2 rows, landscape cards) */}
      <div className="print:m-0 p-4 print:p-0">
        {Array.from({ length: Math.ceil(cards.length / 4) }).map((_, pageIdx) => {
          const pageCards = cards.slice(pageIdx * 4, (pageIdx + 1) * 4)
          return (
            <div
              key={pageIdx}
              className="w-[210mm] h-[297mm] mx-auto mb-8 print:mb-0 print:break-after-page bg-white grid grid-cols-1 grid-rows-4 gap-3 p-4 print:p-[5mm]"
              style={{ pageBreakAfter: 'always' }}
            >
              {pageCards.map((card) => (
                <MiniCardSvg
                  key={card.id}
                  card={card}
                  cooperativeName={currentCooperative?.name}
                  faitiereName={currentCooperative?.faitiereName}
                />
              ))}
              {/* Fill empty slots */}
              {Array.from({ length: 4 - pageCards.length }).map((_, i) => (
                <div key={`empty-${i}`} className="border border-dashed border-gray-200 rounded-lg" />
              ))}
            </div>
          )
        })}
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { margin: 0; padding: 0; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}

function MiniCardSvg({
  card,
  cooperativeName,
  faitiereName,
}: {
  card: MemberCard
  cooperativeName?: string
  faitiereName?: string
}) {
  const svgString = useMemo(() => {
    const schema = buildCardSchema({
      member: {
        first_name: card.member?.first_name ?? '',
        last_name: card.member?.last_name ?? '',
        phone: card.member?.phone,
        photo_url: card.member?.photo_url,
        village: card.member?.village,
        canton: card.member?.canton,
        prefecture: card.member?.prefecture,
        region: card.member?.region,
      },
      cardNumber: card.card_number,
      expiryDate: card.expiry_date,
      createdAt: card.created_at,
      cooperativeName: cooperativeName ?? '',
      faitiereName: faitiereName ?? 'FaîtiereHub',
      level: 'bronze',
    })
    return renderToSvgString(schema)
  }, [card, cooperativeName, faitiereName])

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden shadow-sm"
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  )
}
