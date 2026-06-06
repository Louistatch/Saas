import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

const GREEN = '#1a6b3c'

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function getAtsLevel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Bon'
  if (score >= 40) return 'Moyen'
  return 'Faible'
}

export default async function AttestationPage({
  params,
}: {
  params: Promise<{ memberId: string }>
}) {
  const { memberId } = await params
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('members')
    .select(`
      id, first_name, last_name, photo_url, status, created_at,
      village, canton, prefecture, region,
      cooperative_id,
      cooperative:cooperatives(name, faitiere_name)
    `)
    .eq('id', memberId)
    .maybeSingle()

  if (!member) notFound()

  const { data: card } = await supabase
    .from('member_cards')
    .select('card_number, expiry_date, card_type')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle()

  const { data: atsData } = await supabase
    .rpc('calculate_member_ats', { p_member_id: memberId })

  const { data: parcelles } = await supabase
    .from('parcelles')
    .select('surface_ha')
    .eq('member_id', memberId)

  const totalSurface = (parcelles ?? []).reduce((acc, p) => acc + (p.surface_ha || 0), 0)
  const totalParcelles = (parcelles ?? []).length

  const atsScore = typeof atsData === 'number' ? atsData : (Array.isArray(atsData) ? atsData[0] : null)
  const scoreNum = typeof atsScore === 'number' ? Math.round(atsScore) : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coop = member.cooperative as any
  const cooperativeName = coop?.name ?? '—'
  const faitiereName = coop?.faitiere_name ?? '—'
  const fullName = `${member.last_name?.toUpperCase()} ${member.first_name}`
  const issueDate = formatDate(new Date().toISOString())

  const location = [member.village, member.canton, member.prefecture, member.region]
    .filter(Boolean)
    .join(', ') || '—'

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A4; margin: 15mm; }
        }
        body { font-family: 'Georgia', serif; background: white; color: #111; }
        * { box-sizing: border-box; }
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
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          ⬇ Télécharger / Imprimer
        </button>
      </div>

      {/* A4 Page */}
      <div style={{
        width: '210mm',
        minHeight: '297mm',
        margin: '20px auto',
        padding: '20mm',
        background: 'white',
        boxShadow: '0 0 20px rgba(0,0,0,0.1)',
        position: 'relative',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, borderBottom: `3px solid ${GREEN}`, paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: GREEN, letterSpacing: 1 }}>
              FaîtiereHub
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              Plateforme de gestion des coopératives agricoles
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#555' }}>
            <div style={{ fontWeight: 'bold', color: '#111' }}>{faitiereName}</div>
            <div>{cooperativeName}</div>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
            République Togolaise
          </div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: '#111',
            textTransform: 'uppercase',
            letterSpacing: 2,
            margin: 0,
            borderTop: `1px solid ${GREEN}`,
            borderBottom: `1px solid ${GREEN}`,
            padding: '12px 0',
          }}>
            Attestation de Membre Actif
          </h1>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
          {/* Left: Photo */}
          <div style={{ flexShrink: 0 }}>
            {member.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.photo_url}
                alt={fullName}
                style={{ width: 110, height: 130, objectFit: 'cover', border: `2px solid ${GREEN}`, borderRadius: 4 }}
              />
            ) : (
              <div style={{
                width: 110, height: 130, border: `2px dashed #aaa`, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#aaa', fontSize: 12, textAlign: 'center',
              }}>
                Photo<br />membre
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#555' }}>Nous soussignés, attestons que :</p>
            <p style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 'bold', color: '#111', textTransform: 'uppercase', letterSpacing: 1 }}>
              {fullName}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <InfoRow label="Coopérative" value={cooperativeName} />
                <InfoRow label="Membre depuis" value={formatDate(member.created_at)} />
                <InfoRow label="Statut" value={
                  <span style={{ color: GREEN, fontWeight: 'bold' }}>Actif ✓</span>
                } />
                {card && (
                  <>
                    <InfoRow label="N° de carte" value={card.card_number} />
                    <InfoRow label="Expiration carte" value={formatDate(card.expiry_date)} />
                    <InfoRow label="Type de carte" value={card.card_type ?? '—'} />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 32,
          background: '#f7f9f7',
          border: `1px solid #d0e8d8`,
          borderRadius: 8,
          padding: 16,
        }}>
          <StatBox label="Score ATS" value={scoreNum !== null ? `${scoreNum}/100` : '—'} sub={scoreNum !== null ? getAtsLevel(scoreNum) : ''} />
          <StatBox label="Parcelles" value={String(totalParcelles)} sub={`${totalSurface.toFixed(2)} ha total`} />
          <StatBox label="Localisation" value={member.canton ?? member.prefecture ?? '—'} sub={member.region ?? ''} />
        </div>

        {/* Location */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 32 }}>
          <tbody>
            <InfoRow label="Localisation complète" value={location} />
          </tbody>
        </table>

        {/* Verify Reference */}
        {card && (
          <div style={{ background: '#f0f7f3', border: `1px solid ${GREEN}`, borderRadius: 6, padding: 12, marginBottom: 24, fontSize: 12 }}>
            <strong>Vérification en ligne :</strong>{' '}
            <span style={{ fontFamily: 'monospace', color: GREEN }}>
              faitierehub.com/verify/{card.card_number}
            </span>
          </div>
        )}

        {/* Bottom: Stamp + Signature */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 40 }}>
          <div style={{ fontSize: 12, color: '#555' }}>
            <div>Émis le : <strong>{issueDate}</strong></div>
            <div style={{ marginTop: 4, color: '#888', fontSize: 11 }}>
              Ce document est généré automatiquement par FaîtiereHub
            </div>
          </div>

          {/* Stamp area */}
          <div style={{
            width: 120,
            height: 120,
            border: '2px dashed #aaa',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#bbb',
            fontSize: 11,
            textAlign: 'center',
            flexShrink: 0,
          }}>
            Cachet<br />officiel
          </div>

          <div style={{ textAlign: 'center', fontSize: 12 }}>
            <div style={{ marginBottom: 40 }}>Le responsable,</div>
            <div style={{ borderTop: '1px solid #111', paddingTop: 4, width: 120 }}>Signature</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute',
          bottom: 15,
          left: 20,
          right: 20,
          borderTop: `1px solid #eee`,
          paddingTop: 8,
          fontSize: 10,
          color: '#999',
          textAlign: 'center',
        }}>
          FaîtiereHub — Plateforme de gestion des coopératives agricoles de l&apos;Afrique de l&apos;Ouest
        </div>
      </div>
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: '5px 8px 5px 0', color: '#666', fontWeight: 'normal', whiteSpace: 'nowrap', verticalAlign: 'top', width: '40%' }}>
        {label} :
      </td>
      <td style={{ padding: '5px 0', fontWeight: 'bold', color: '#111', verticalAlign: 'top' }}>
        {value}
      </td>
    </tr>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 'bold', color: GREEN }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
