import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

const GREEN = '#1a6b3c'

type ReportType = 'membres' | 'cotisations' | 'productions'

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const REPORT_LABELS: Record<ReportType, string> = {
  membres: 'Liste des Membres',
  cotisations: 'Rapport des Cotisations',
  productions: 'Rapport de Production',
}

export default async function CooperativeReportPage({
  params,
}: {
  params: Promise<{ coopId: string; type: string }>
}) {
  const { coopId, type } = await params

  if (!['membres', 'cotisations', 'productions'].includes(type)) {
    notFound()
  }

  const reportType = type as ReportType
  const supabase = await createClient()

  const { data: coop } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', coopId)
    .maybeSingle()

  if (!coop) notFound()

  const issueDate = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // ---- MEMBRES ----
  let membresRows: React.ReactNode = null
  let membresCount = 0
  if (reportType === 'membres') {
    const { data: members } = await supabase
      .from('members')
      .select(`
        id, first_name, last_name, status, canton, created_at,
        member_cards(card_number)
      `)
      .eq('cooperative_id', coopId)
      .order('last_name')

    membresCount = (members ?? []).length
    membresRows = (
      <>
        <thead>
          <tr style={{ background: GREEN, color: 'white' }}>
            <Th>#</Th>
            <Th>Nom complet</Th>
            <Th>Statut</Th>
            <Th>Canton</Th>
            <Th>N° Carte</Th>
            <Th>Membre depuis</Th>
          </tr>
        </thead>
        <tbody>
          {(members ?? []).map((m, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cardNumber = (m.member_cards as any)?.[0]?.card_number ?? '—'
            return (
              <tr key={m.id} style={{ background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                <Td>{i + 1}</Td>
                <Td><strong>{m.last_name?.toUpperCase()} {m.first_name}</strong></Td>
                <Td>
                  <span style={{ color: m.status === 'active' ? GREEN : '#999' }}>
                    {m.status === 'active' ? 'Actif' : m.status ?? '—'}
                  </span>
                </Td>
                <Td>{m.canton ?? '—'}</Td>
                <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{cardNumber}</Td>
                <Td>{formatDate(m.created_at)}</Td>
              </tr>
            )
          })}
        </tbody>
      </>
    )
  }

  // ---- COTISATIONS ----
  let cotisationsRows: React.ReactNode = null
  let cotisationsCount = 0
  if (reportType === 'cotisations') {
    const { data: cotisations } = await supabase
      .from('cotisations')
      .select(`
        id, amount, type, status, campaign_year, paid_date,
        member:members(first_name, last_name)
      `)
      .eq('cooperative_id', coopId)
      .order('paid_date', { ascending: false })

    cotisationsCount = (cotisations ?? []).length
    cotisationsRows = (
      <>
        <thead>
          <tr style={{ background: GREEN, color: 'white' }}>
            <Th>#</Th>
            <Th>Membre</Th>
            <Th>Montant (FCFA)</Th>
            <Th>Type</Th>
            <Th>Statut</Th>
            <Th>Campagne</Th>
            <Th>Date paiement</Th>
          </tr>
        </thead>
        <tbody>
          {(cotisations ?? []).map((c, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mem = c.member as any
            const memberName = mem ? `${mem.last_name?.toUpperCase()} ${mem.first_name}` : '—'
            return (
              <tr key={c.id} style={{ background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                <Td>{i + 1}</Td>
                <Td><strong>{memberName}</strong></Td>
                <Td style={{ textAlign: 'right' }}>{Number(c.amount ?? 0).toLocaleString('fr-FR')}</Td>
                <Td>{c.type ?? '—'}</Td>
                <Td>
                  <span style={{ color: c.status === 'paid' ? GREEN : '#e67e22' }}>
                    {c.status === 'paid' ? 'Payé' : c.status ?? '—'}
                  </span>
                </Td>
                <Td>{c.campaign_year ?? '—'}</Td>
                <Td>{formatDate(c.paid_date)}</Td>
              </tr>
            )
          })}
        </tbody>
      </>
    )
  }

  // ---- PRODUCTIONS ----
  let productionsRows: React.ReactNode = null
  let productionsCount = 0
  if (reportType === 'productions') {
    const { data: productions } = await supabase
      .from('productions')
      .select(`
        id, culture, quantity_kg, campaign_year,
        member:members(first_name, last_name)
      `)
      .eq('cooperative_id', coopId)
      .order('campaign_year', { ascending: false })

    productionsCount = (productions ?? []).length
    productionsRows = (
      <>
        <thead>
          <tr style={{ background: GREEN, color: 'white' }}>
            <Th>#</Th>
            <Th>Membre</Th>
            <Th>Culture</Th>
            <Th>Quantité (kg)</Th>
            <Th>Campagne</Th>
          </tr>
        </thead>
        <tbody>
          {(productions ?? []).map((p, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mem = p.member as any
            const memberName = mem ? `${mem.last_name?.toUpperCase()} ${mem.first_name}` : '—'
            return (
              <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                <Td>{i + 1}</Td>
                <Td><strong>{memberName}</strong></Td>
                <Td>{p.culture ?? '—'}</Td>
                <Td style={{ textAlign: 'right' }}>{Number(p.quantity_kg ?? 0).toLocaleString('fr-FR')}</Td>
                <Td>{p.campaign_year ?? '—'}</Td>
              </tr>
            )
          })}
        </tbody>
      </>
    )
  }

  const totalCount = membresCount || cotisationsCount || productionsCount

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A4 landscape; margin: 12mm; }
        }
        body { font-family: 'Georgia', serif; background: white; color: #111; }
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      {/* Print button */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 999 }}>
        <button
          onClick={() => window.print()}
          style={{
            background: GREEN,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            fontSize: 14,
            fontFamily: 'sans-serif',
            cursor: 'pointer',
          }}
        >
          ⬇ Télécharger / Imprimer
        </button>
      </div>

      <div style={{ maxWidth: '100%', padding: '24px 32px', background: 'white', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${GREEN}`, paddingBottom: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 'bold', color: GREEN }}>FaîtiereHub</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{coop.faitiere_name} — {coop.name}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}>
            <div>Généré le : <strong>{issueDate}</strong></div>
            <div>Total enregistrements : <strong>{totalCount}</strong></div>
          </div>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 18, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2, color: '#111', marginBottom: 24 }}>
          {REPORT_LABELS[reportType]}
        </h1>

        {/* Table */}
        <table>
          {membresRows}
          {cotisationsRows}
          {productionsRows}
        </table>

        {/* Footer */}
        <div style={{ marginTop: 40, borderTop: '1px solid #eee', paddingTop: 12, fontSize: 11, color: '#999', textAlign: 'center' }}>
          Généré par FaîtiereHub le {issueDate} — faitierehub.com
        </div>
      </div>
    </>
  )
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', fontSize: 12, ...style }}>
      {children}
    </th>
  )
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '7px 12px', fontSize: 12, borderBottom: '1px solid #eee', verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  )
}
