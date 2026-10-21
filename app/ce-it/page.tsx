import Catalogue from '@/components/ce-it/catalogue'
import { enabled } from '@/lib/ce-it/server'
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default function Page() {
  if (!enabled()) notFound()
  return <Catalogue />
}
