import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Comptes d’exploitation et itinéraires techniques | FaîtièreHub',
  robots: { index: false, follow: false },
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
