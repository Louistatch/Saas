import { redirect } from 'next/navigation'

/**
 * Legacy duplicate route. We consolidated cooperative settings under
 * /dashboard/settings — this page now permanently redirects there.
 */
export default function LegacyCooperativeSettingsRedirect() {
  redirect('/dashboard/settings')
}
