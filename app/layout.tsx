import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/app/context/auth-context'
import { CooperativeProvider } from '@/app/context/cooperative-context'
import { ThemeProvider } from '@/components/theme-provider'
import { PostHogProvider } from '@/app/providers/posthog-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'FaîtiereHub — Plateforme numérique pour coopératives agricoles',
  description:
    'Donnez du pouvoir à vos coopératives agricoles avec des outils numériques pour la gestion des membres, les comptes d\'exploitation et les décisions basées sur les données.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CoopScan',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      className={`${geist.variable} ${geistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <AuthProvider>
              <CooperativeProvider>
                {children}
                <Toaster />
                {process.env.NODE_ENV === 'production' && <Analytics />}
              </CooperativeProvider>
            </AuthProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
