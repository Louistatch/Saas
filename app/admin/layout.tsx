import { requireRole } from '@/lib/security/assert-access'
import { AdminShell } from './admin-shell'

/**
 * Admin layout — SERVER COMPONENT (BUG-05).
 *
 * Authorization is enforced HERE, server-side, before any admin UI is sent to
 * the client. requireRole('super_admin') resolves the role from the profiles
 * table (never from a spoofable JWT claim) and redirects on failure.
 *
 * This closes the gap where the old client-only ProtectedRoute briefly rendered
 * admin content (the 3s fallback, SEC-04) and where a tampered JWT could pass
 * the edge check (BUG-05). Now: edge middleware + this server guard + RLS.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole('super_admin')

  return <AdminShell>{children}</AdminShell>
}
