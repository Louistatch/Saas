import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import {
  CARD_COMMISSION_FCFA,
  CREDIT_PACKS,
  INDICATIVE_CARD_PRICES,
  TRAINING_FEE_FCFA,
  TRAINING_INSTALLMENTS,
  TRAINING_INSTALLMENT_FCFA,
  WELCOME_CREDITS,
  formatFcfa,
} from '@/lib/payg/model'
import { publicPageMetadata } from '@/lib/seo'
import { Check, Network } from 'lucide-react'
import Link from 'next/link'

export const metadata = publicPageMetadata('/pricing')

// Tarifs PAYG (refonte d'octobre 2026) : plus d'abonnement. Les montants affichés viennent de
// lib/payg/model.ts ; ceux qui font foi au paiement sont dans billing_rules.

const AUDIENCES = [
  {
    title: 'Coopératives et unions',
    price: 'Aucun abonnement',
    lines: [
      'Enregistrer ses membres, les consulter, scanner leurs cartes : jamais facturé.',
      '10 cartes numériques gratuites par coopérative.',
      'Cartes imprimées émises par un opérateur certifié qui vous accompagne.',
    ],
    cta: { href: '/auth/signup', label: 'Créer ma coopérative' },
  },
  {
    title: 'Opérateur individuel',
    price: `Formation ${formatFcfa(TRAINING_FEE_FCFA)}`,
    lines: [
      `En une fois ou en ${TRAINING_INSTALLMENTS} tranches de ${formatFcfa(TRAINING_INSTALLMENT_FCFA)}.`,
      `${WELCOME_CREDITS} crédits offerts à l’ouverture, une seule fois.`,
      'Puis des crédits prépayés, achetés quand vous en avez besoin.',
    ],
    cta: { href: '/auth/signup/operator', label: 'Devenir opérateur' },
  },
  {
    title: 'Institution',
    price: 'Un portefeuille, plusieurs agents',
    lines: [
      'Fédération, ONG ou projet : un seul solde de crédits pour toute l’équipe.',
      `${WELCOME_CREDITS} crédits offerts une fois à l’institution, pas par agent.`,
      `Chaque agent est formé (${formatFcfa(TRAINING_FEE_FCFA)}) : l’institution paie, ou l’agent règle ses tranches.`,
    ],
    cta: { href: '/contact', label: 'Ouvrir un compte institution' },
  },
]

const ALWAYS_FREE = [
  'Consulter la fiche d’un producteur',
  'Scanner le QR code d’une carte',
  'Enregistrer un nouveau producteur',
  'Réimprimer soi-même une carte déjà émise',
  'Une émission qui échoue : aucun crédit n’est pris',
]

const FAQ = [
  {
    q: 'Y a-t-il un abonnement ?',
    a: 'Non. L’opérateur achète des crédits à l’avance, au minimum 20. Chaque carte commerciale finalisée en utilise un. Rien n’est prélevé chaque mois.',
  },
  {
    q: 'Une carte peut-elle coûter deux crédits ?',
    a: 'Non. Une carte finalisée prend exactement un crédit, une seule fois. Si la connexion coupe pendant l’émission, la nouvelle tentative retrouve la carte déjà émise sans reprendre de crédit.',
  },
  {
    q: 'Qui fixe le prix payé par le producteur ?',
    a: `L’opérateur, selon le support et le service rendu. Les prix indiqués sont indicatifs. Ils comprennent la commission FaîtièreHub de ${formatFcfa(CARD_COMMISSION_FCFA)} ; le reste couvre l’impression, le déplacement et le travail de l’opérateur.`,
  },
  {
    q: 'Les crédits se partagent-ils entre opérateurs ?',
    a: 'Non, ils ne se transfèrent pas. Dans une institution, ils sont communs à toute l’équipe : chaque agent émet sur le même solde, sur les coopératives qui lui sont confiées.',
  },
  {
    q: 'Et l’impression par FaîtièreHub ?',
    a: 'FaîtièreHub Print fabrique et livre des cartes déjà émises, sur devis : fabrication et livraison s’ajoutent à la commission déjà prise, qui n’est jamais reprise. La livraison n’est pas gratuite d’office.',
  },
  {
    q: 'La carte est-elle une pièce d’identité ?',
    a: 'Non. La carte FaîtièreHub atteste l’appartenance à une coopérative. Ce n’est pas une pièce d’identité officielle.',
  },
  {
    q: 'Haroo est-il payant ?',
    a: 'Non. Ouvriers agricoles, acheteurs et agronomes créent leur profil Haroo sans frais.',
  },
]

export default function PricingPage() {
  const maxPrice = Math.max(...INDICATIVE_CARD_PRICES.map((p) => p.priceFcfa))
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-20 sm:px-6 lg:px-8">
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Pas d’abonnement. Une carte, un crédit.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          FaîtièreHub ne prend rien sur l’enregistrement des producteurs ni sur les consultations.
          Il prend {formatFcfa(CARD_COMMISSION_FCFA)} quand une carte commerciale est finalisée,
          payés d’avance par l’opérateur qui l’émet.
        </p>

        <figure className="mt-12 space-y-6" aria-labelledby="anatomy-caption">
          <figcaption id="anatomy-caption" className="text-sm font-medium text-foreground">
            Ce que paie le producteur pour sa carte (prix indicatifs)
          </figcaption>
          {INDICATIVE_CARD_PRICES.map((p) => (
            <div key={p.format} className="space-y-2">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-base font-semibold text-foreground">{p.label}</span>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {formatFcfa(p.priceFcfa)}
                </span>
              </div>
              <div
                className="flex h-10 overflow-hidden rounded-xl"
                style={{ width: `${(p.priceFcfa / maxPrice) * 100}%` }}
                role="img"
                aria-label={`${formatFcfa(CARD_COMMISSION_FCFA)} de commission FaîtièreHub, ${formatFcfa(p.priceFcfa - CARD_COMMISSION_FCFA)} pour l’opérateur`}
              >
                <span
                  className="flex shrink-0 items-center justify-center bg-[#0d3d22] text-xs font-semibold text-white"
                  style={{ width: `${(CARD_COMMISSION_FCFA / p.priceFcfa) * 100}%` }}
                >
                  250
                </span>
                <span className="flex flex-1 items-center bg-primary/15 px-3 text-xs text-foreground">
                  {formatFcfa(p.priceFcfa - CARD_COMMISSION_FCFA)} pour l’opérateur
                </span>
              </div>
            </div>
          ))}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-[#0d3d22]" />
            Commission FaîtièreHub : un crédit, pris une seule fois, à l’émission.
          </p>
        </figure>
      </section>

      <section className="border-t border-border bg-card/50 py-16">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="flex flex-col">
              <h2 className="text-lg font-bold text-foreground">{a.title}</h2>
              <p className="mt-1 text-sm font-medium text-primary">{a.price}</p>
              <ul className="mt-4 flex-1 space-y-2.5">
                {a.lines.map((l) => (
                  <li key={l} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {l}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-6 min-h-11">
                <Link href={a.cta.href}>{a.cta.label}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Crédits prépayés
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Achat minimum : 20 crédits. Paiement par mobile money ou carte sur la page sécurisée
            FedaPay. Les crédits offerts sont utilisés en premier.
          </p>
          <table className="mt-6 w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Crédits</th>
                <th className="py-2 font-medium">Cartes commerciales</th>
                <th className="py-2 text-right font-medium">Prix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CREDIT_PACKS.map((p) => (
                <tr key={p.code}>
                  <td className="py-3 text-lg font-bold tabular-nums text-foreground">
                    {p.credits}
                  </td>
                  <td className="py-3 text-muted-foreground">{p.credits} cartes</td>
                  <td className="py-3 text-right font-semibold tabular-nums text-foreground">
                    {formatFcfa(p.priceFcfa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Jamais facturé</h2>
          <ul className="mt-6 space-y-2.5">
            {ALWAYS_FREE.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            La formation ({formatFcfa(TRAINING_FEE_FCFA)} par personne formée) est payée à part :
            elle ne donne aucun crédit, et un crédit ne paie pas la formation.
          </p>
        </div>
      </section>

      <section className="bg-card/50 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-2xl font-extrabold tracking-tight text-foreground">
            Questions fréquentes
          </h2>
          <div className="space-y-6">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-6 last:border-0">
                <h3 className="mb-2 font-semibold text-foreground">{q}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <Network className="h-8 w-8 text-amber-700" aria-hidden />
          <h2 className="text-2xl font-extrabold text-foreground">
            Ouvrier, acheteur ou agronome ?
          </h2>
          <p className="max-w-xl text-muted-foreground">
            Haroo est sans frais : profil professionnel, carte vérifiable par QR code et
            opportunités de votre région.
          </p>
          <Button asChild className="min-h-11 bg-amber-600 text-white hover:bg-amber-700">
            <Link href="/auth/signup/haroo">Créer mon profil Haroo</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  )
}
