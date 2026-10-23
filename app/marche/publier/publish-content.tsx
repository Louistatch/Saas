'use client'

/**
 * Publier : le formulaire, prérempli du numéro et du canton du profil Haroo quand il y en a.
 * Après la publication, la suite logique : inviter des ouvriers (offre de travail), voir
 * l'annonce, ou suivre les réponses.
 */
import { useAuth } from '@/app/context/auth-context'
import { AnnouncementForm, type PublishedAnnouncement } from '@/components/market/announcement-form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ANNOUNCEMENT_TYPE_VALUES, type AnnouncementType } from '@/lib/market/work'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Lock } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ProfileDefaults {
  phone: string | null
  cantonId: string | null
}

/** Numéro et canton du profil Haroo du compte (lecture de ses propres lignes). */
async function loadDefaults(userId: string): Promise<ProfileDefaults> {
  const supabase = createClient()
  const [ouvrier, acheteur, agronome] = await Promise.all([
    supabase
      .from('haroo_ouvrier_profiles')
      .select('id, phone')
      .eq('user_id', userId)
      .maybeSingle<{ id: string; phone: string | null }>(),
    supabase
      .from('haroo_acheteur_profiles')
      .select('phone')
      .eq('user_id', userId)
      .maybeSingle<{ phone: string | null }>(),
    supabase
      .from('haroo_agronome_profiles')
      .select('phone, canton_id')
      .eq('user_id', userId)
      .maybeSingle<{ phone: string | null; canton_id: string | null }>(),
  ])
  let cantonId = agronome.data?.canton_id ?? null
  if (!cantonId && ouvrier.data?.id) {
    const { data } = await supabase
      .from('haroo_ouvrier_cantons')
      .select('canton_id')
      .eq('ouvrier_id', ouvrier.data.id)
      .limit(1)
      .maybeSingle<{ canton_id: string | null }>()
    cantonId = data?.canton_id ?? null
  }
  return {
    phone: ouvrier.data?.phone ?? acheteur.data?.phone ?? agronome.data?.phone ?? null,
    cantonId,
  }
}

export default function PublishContent() {
  const { user, isLoading } = useAuth()
  const params = useSearchParams()
  const asked = params.get('type') as AnnouncementType | null
  const type: AnnouncementType =
    asked && (ANNOUNCEMENT_TYPE_VALUES as readonly string[]).includes(asked) ? asked : 'prevente'
  const [defaults, setDefaults] = useState<ProfileDefaults>({ phone: null, cantonId: null })
  const [published, setPublished] = useState<PublishedAnnouncement | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!user) return
    let alive = true
    void loadDefaults(user.id).then((d) => {
      if (alive) setDefaults(d)
    })
    return () => {
      alive = false
    }
  }, [user])

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />

  if (!user) {
    return (
      <div className="rounded-2xl border border-border p-6 text-center sm:p-8">
        <Lock aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-lg font-semibold">Un compte gratuit pour publier</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Votre annonce porte votre prénom, et les réponses vous arrivent dans votre suivi. La
          consultation reste libre.
        </p>
        <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2">
          <Button asChild variant="outline" className="hover:bg-muted hover:text-foreground h-11">
            <Link
              href={`/auth/login?redirect=${encodeURIComponent(`/marche/publier?type=${type}`)}`}
            >
              Se connecter
            </Link>
          </Button>
          <Button asChild className="h-11">
            <Link href="/auth/signup/haroo">Créer un compte</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (published) {
    const job = published.type === 'job'
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
        <p className="flex items-center gap-2 text-lg font-bold text-primary">
          <CheckCircle2 aria-hidden="true" className="h-6 w-6" />
          {job ? 'Votre offre de travail est en ligne' : 'Votre annonce est en ligne'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {job
            ? 'Les ouvriers proches peuvent répondre « Je suis disponible ». N’attendez pas : invitez vous-même ceux qui sont disponibles près de votre champ.'
            : 'Les personnes intéressées répondent depuis le marché. Vous les retenez ou les déclinez dans Mon suivi.'}
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {job ? (
            <Button asChild className="h-12 bg-amber-700 text-white hover:bg-amber-800">
              <Link href="/travail?vue=ouvriers">Inviter des ouvriers disponibles</Link>
            </Button>
          ) : (
            <Button asChild className="h-12">
              <Link href="/marche">Voir le marché</Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="hover:bg-muted hover:text-foreground h-12 bg-background"
          >
            <Link href="/marche/suivi">Voir mon suivi</Link>
          </Button>
        </div>
        <button
          type="button"
          className="mt-4 text-sm font-medium underline underline-offset-2"
          onClick={() => {
            setPublished(null)
            setRound((r) => r + 1)
          }}
        >
          Publier une autre annonce
        </button>
      </div>
    )
  }

  return (
    <AnnouncementForm
      key={round}
      defaultType={type}
      defaultPhone={defaults.phone}
      defaultCantonId={defaults.cantonId}
      onPublished={(p) => {
        setPublished(p)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
    />
  )
}
