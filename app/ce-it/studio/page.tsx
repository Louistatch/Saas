import Studio from '@/components/ce-it/studio'
import { enabled } from '@/lib/ce-it/server'
import { getAccessContext } from '@/lib/security/assert-access'
import { notFound, redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default async function Page() {
  if (!enabled()) notFound()
  if (!(await getAccessContext())) redirect('/auth/login?redirect=/ce-it/studio')
  return <Studio />
}
