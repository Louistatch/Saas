'use client'

import type { CSSProperties } from 'react'

/**
 * Print / save-as-PDF button for the server-rendered report pages. It lives in its own client
 * component: an onClick cannot be passed from a Server Component (the page crashed with a 500).
 */
export function PrintButton({ style }: { style?: CSSProperties }) {
  return (
    <button type="button" onClick={() => window.print()} style={style}>
      ⬇ Télécharger / Imprimer
    </button>
  )
}
