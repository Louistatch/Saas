'use client'

/**
 * HomeClient — wrapper for the homepage.
 * Does NOT auto-redirect authenticated users anymore.
 * The AuthButtons component already shows "Tableau de bord" when logged in,
 * which is the correct UX (user chooses when to navigate away).
 * 
 * Auto-redirecting caused:
 * - Inability to view the homepage when logged in
 * - Redirect loops when cookies were stale
 * - Conflicts with the login/logout flow
 */
export function HomeClient({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
