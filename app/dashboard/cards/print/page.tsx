'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { LoadingBlock } from '@/components/shared/loading'
import { QrImage } from '@/components/shared/qr-image'
import Link from 'next/link'
import type { MemberCard } from '@/types/domain'

/**
 * Print page: displays 8 member cards per A4 page.
 * Optimized for printing (no sidebar, no header, print-specific CSS).
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
      .select('*, member:members(first_name, last_name, phone, photo_url, prefecture, region, village, canton)')
      .eq('status', 'active')
    if (user?.role !== 'super_admin') {
      query = query.eq('cooperative_id', currentCooperative.id)
    }
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
          {cards.length} carte{cards.length !== 1 ? 's' : ''} • {Math.ceil(cards.length / 8)} page{Math.ceil(cards.length / 8) !== 1 ? 's' : ''} A4
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" /> Imprimer en PDF
        </Button>
      </div>

      {/* A4 Pages */}
      <div className="print:m-0 p-4 print:p-0">
        {Array.from({ length: Math.ceil(cards.length / 8) }).map((_, pageIdx) => {
          const pageCards = cards.slice(pageIdx * 8, (pageIdx + 1) * 8)
          return (
            <div
              key={pageIdx}
              className="w-[210mm] h-[297mm] mx-auto mb-8 print:mb-0 print:break-after-page bg-white grid grid-cols-2 grid-rows-4 gap-2 p-4 print:p-[5mm]"
              style={{ pageBreakAfter: 'always' }}
            >
              {pageCards.map((card) => (
                <MiniCard key={card.id} card={card} cooperativeName={currentCooperative?.name} faitiereName={currentCooperative?.faitiereName} />
              ))}
              {/* Fill empty slots */}
              {Array.from({ length: 8 - pageCards.length }).map((_, i) => (
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

function MiniCard({
  card,
  cooperativeName,
  faitiereName,
}: {
  card: MemberCard
  cooperativeName?: string
  faitiereName?: string
}) {
  const memberName = card.member ? `${card.member.first_name} ${card.member.last_name}` : '—'
  const locality = [card.member?.village, card.member?.canton, card.member?.prefecture].filter(Boolean).join(', ')
  const qrData = card.qr_data || JSON.stringify({ card: card.card_number })

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-gradient-to-br from-[#0a2e1a] to-[#0d3d22] text-white p-3 flex flex-col justify-between relative" style={{ fontSize: '8px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-[9px] text-green-300">FaîtiereHub</span>
        <span className="text-[7px] opacity-60">CARTE MEMBRE</span>
        <span className="text-[7px] text-green-300 bg-green-900/50 px-1 rounded">✓</span>
      </div>

      {/* Body */}
      <div className="flex gap-2 flex-1">
        {/* Photo */}
        <div className="w-12 h-14 rounded bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
          {card.member?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.member.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg opacity-30">👤</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-bold text-[10px] truncate">{memberName}</p>
          <p className="text-[7px] opacity-70 truncate">{cooperativeName ?? '—'}</p>
          <p className="text-[7px] opacity-60 truncate">{locality || '—'}</p>
          {card.member?.phone && <p className="text-[7px] opacity-60">{card.member.phone}</p>}
          <p className="font-mono text-[8px] text-green-300 mt-1">{card.card_number}</p>
        </div>

        {/* QR */}
        <div className="shrink-0">
          <div className="bg-white rounded p-0.5">
            <QrImage value={qrData} size={40} margin={0} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/10">
        <span className="text-[6px] opacity-50">Valide: {card.expiry_date ?? '—'}</span>
        <span className="text-[6px] opacity-50">{faitiereName ?? 'FENOMAT'}</span>
      </div>
    </div>
  )
}
