'use client'

export default function OfflinePage() {
  return (
    <main style={{
      minHeight: '100dvh',
      background: 'radial-gradient(120% 90% at 20% 0%, oklch(0.40 0.18 142) 0%, oklch(0.22 0.10 142) 45%, oklch(0.12 0.06 142) 100%)',
      color: '#eafff2',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      textAlign: 'center',
      padding: '32px',
      fontFamily: 'Barlow, system-ui, sans-serif',
    }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="38" stroke="#4dffa0" strokeWidth="2" strokeOpacity="0.4"/>
        <path d="M26 40 Q40 22 54 40 Q40 58 26 40Z" fill="none" stroke="#4dffa0" strokeWidth="2"/>
        <line x1="24" y1="56" x2="56" y2="24" stroke="#ff6b6b" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, fontFamily: 'Barlow Condensed, sans-serif' }}>
        Hors ligne
      </h1>
      <p style={{ color: 'oklch(0.65 0.10 142)', maxWidth: '320px', margin: 0, fontSize: '16px' }}>
        La vérification nécessite une connexion internet. Reconnectez-vous puis réessayez.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '8px',
          padding: '12px 28px',
          background: '#4dffa0',
          color: '#0a3d24',
          border: 'none',
          borderRadius: '12px',
          fontWeight: 700,
          fontSize: '16px',
          cursor: 'pointer',
        }}
      >
        Réessayer
      </button>
    </main>
  )
}
