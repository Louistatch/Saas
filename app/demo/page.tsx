import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// Démonstration sur rendez-vous. Aucun identifiant n'est publié ici : les comptes de
// démonstration donnaient accès à des données réelles (dont un compte super_admin).
export const metadata = {
  title: 'Demander une démonstration — FaîtiereHub',
}

export default function DemoPage() {
  return (
    <MarketingLayout>
      <section className="px-4 py-20">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-4xl font-bold text-foreground">Voir FaîtiereHub en action</h1>
          <p className="text-lg text-muted-foreground">
            Une personne de l’équipe vous présente la plateforme avec un espace de démonstration
            préparé pour votre organisation : membres, cartes à QR code, cotisations et suivi des
            exploitations.
          </p>
          <p className="text-muted-foreground">
            Indiquez le nom de votre organisation et son nombre de membres : nous vous proposons un
            créneau et un accès temporaire.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact">
              <Button className="bg-primary hover:bg-primary/90">Demander une démonstration</Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" className="border-border">
                J’ai déjà un compte
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
