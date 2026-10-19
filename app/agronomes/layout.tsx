import { publicPageMetadata } from '@/lib/seo'
import type { ReactNode } from 'react'

export const metadata = publicPageMetadata('/agronomes')

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
