export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'Georgia, serif', background: 'white', color: '#111' }}>
        {children}
      </body>
    </html>
  )
}
