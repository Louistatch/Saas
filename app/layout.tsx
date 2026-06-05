import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/app/context/auth-context'
import { CooperativeProvider } from '@/app/context/cooperative-context'
import { ThemeProvider } from '@/components/theme-provider'
import { PostHogProvider } from '@/app/providers/posthog-provider'
import { Toaster } from '@/components/ui/toaster'
import { RegisterSW } from '@/components/pwa/register-sw'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'FaîtiereHub — Plateforme numérique pour coopératives agricoles',
  description:
    'Donnez du pouvoir à vos coopératives agricoles avec des outils numériques pour la gestion des membres, les comptes d\'exploitation et les décisions basées sur les données.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Scanner FH',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png' },
      { url: '/pwa/icon-192.png', sizes: '192x192' },
    ],
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
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#16a34a" />
        <meta name="msapplication-TileColor" content="#0a3d24" />
      </head>
      <body className="font-sans antialiased min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <AuthProvider>
              <CooperativeProvider>
                {children}
                <Toaster />
                <RegisterSW />
                <InstallPrompt />
                {process.env.NODE_ENV === 'production' && <Analytics />}
              </CooperativeProvider>
            </AuthProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
