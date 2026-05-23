import '@/app/globals.css'

/**
 * Minimal layout for embed widgets — no sidebar, no header, no auth.
 * Designed to be loaded inside iframes on external sites.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 bg-background text-foreground">
      {children}
    </div>
  )
}
