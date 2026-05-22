import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/shared/logo'
import { ShieldX, ArrowLeft } from 'lucide-react'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-destructive/10">
            <ShieldX className="h-12 w-12 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Accès refusé</h1>
          <p className="text-muted-foreground">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
            Contactez votre administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Tableau de bord
            </Button>
          </Link>
          <Link href="/">
            <Button className="gap-2">
              Accueil
            </Button>
          </Link>
        </div>
        <div className="pt-4">
          <Logo size="sm" />
        </div>
      </div>
    </div>
  )
}
