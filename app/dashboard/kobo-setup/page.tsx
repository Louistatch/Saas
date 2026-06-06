import { redirect } from 'next/navigation'

// Legacy route — superseded by /dashboard/integrations
export default function KoboSetupLegacyPage() {
  redirect('/dashboard/integrations')
}
