import { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'

export const metadata: Metadata = {
  title: 'Politique cookies — FaîtiereHub',
  description:
    'Politique d\'utilisation des cookies sur FaîtiereHub : types de cookies, cookies essentiels, analytics et gestion de vos préférences.',
}

export default function CookiesPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
          Politique cookies
        </h1>
        <p className="text-muted-foreground mb-12">
          Dernière mise à jour : 1er janvier 2025
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
          {/* Introduction */}
          <div className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              La plateforme FaîtiereHub utilise des cookies et technologies similaires pour assurer
              son bon fonctionnement, améliorer l&apos;expérience utilisateur et analyser l&apos;utilisation
              du service. Cette politique vous informe sur les cookies que nous utilisons et comment
              les gérer.
            </p>
          </div>

          {/* Qu'est-ce qu'un cookie */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. Qu&apos;est-ce qu&apos;un cookie ?</h2>
            <p className="text-muted-foreground leading-relaxed">
              Un cookie est un petit fichier texte déposé sur votre appareil (ordinateur, tablette,
              smartphone) lors de la visite d&apos;un site web. Il permet au site de mémoriser des
              informations sur votre visite, comme votre langue préférée ou votre état de connexion,
              afin de faciliter votre prochaine visite.
            </p>
          </div>

          {/* Types de cookies */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">2. Types de cookies utilisés</h2>

            {/* Cookies essentiels */}
            <div className="rounded-lg border border-border bg-background p-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <h3 className="text-lg font-semibold text-foreground">Cookies essentiels</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ces cookies sont indispensables au fonctionnement de la Plateforme. Ils ne peuvent
                pas être désactivés. Ils permettent notamment :
              </p>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>La gestion de votre session d&apos;authentification</li>
                <li>La mémorisation de vos préférences de sécurité</li>
                <li>Le fonctionnement du panier sur le marketplace</li>
                <li>La protection contre les attaques CSRF</li>
              </ul>
              <div className="mt-3 rounded bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Durée :</strong> Session ou 30 jours maximum<br />
                  <strong>Base légale :</strong> Intérêt légitime (fonctionnement du service)
                </p>
              </div>
            </div>

            {/* Cookies analytics */}
            <div className="rounded-lg border border-border bg-background p-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                <h3 className="text-lg font-semibold text-foreground">Cookies analytiques</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ces cookies nous aident à comprendre comment les visiteurs interagissent avec la
                Plateforme en collectant des informations de manière anonyme. Ils permettent :
              </p>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>Le comptage des visiteurs et des pages vues</li>
                <li>L&apos;identification des pages les plus populaires</li>
                <li>La compréhension des parcours utilisateurs</li>
                <li>La détection des problèmes techniques</li>
              </ul>
              <div className="mt-3 rounded bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Outil :</strong> Vercel Analytics (respectueux de la vie privée)<br />
                  <strong>Durée :</strong> 12 mois maximum<br />
                  <strong>Base légale :</strong> Consentement
                </p>
              </div>
            </div>

            {/* Cookies fonctionnels */}
            <div className="rounded-lg border border-border bg-background p-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-amber-500"></div>
                <h3 className="text-lg font-semibold text-foreground">Cookies fonctionnels</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ces cookies permettent d&apos;améliorer votre expérience en mémorisant vos choix :
              </p>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>Votre préférence de thème (clair/sombre)</li>
                <li>Votre langue d&apos;interface</li>
                <li>Vos filtres et paramètres d&apos;affichage</li>
              </ul>
              <div className="mt-3 rounded bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Durée :</strong> 12 mois maximum<br />
                  <strong>Base légale :</strong> Consentement
                </p>
              </div>
            </div>
          </div>

          {/* Comment gérer les cookies */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">3. Comment gérer vos cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Vous pouvez à tout moment modifier vos préférences en matière de cookies :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Via votre navigateur :</strong> la plupart des
                navigateurs vous permettent de refuser ou supprimer les cookies dans leurs paramètres.
                Consultez l&apos;aide de votre navigateur pour les instructions spécifiques.
              </li>
              <li>
                <strong className="text-foreground">Via notre bandeau cookies :</strong> lors de votre
                première visite, un bandeau vous permet d&apos;accepter ou refuser les cookies non essentiels.
                Vous pouvez modifier ce choix à tout moment.
              </li>
            </ul>
            <div className="rounded-lg border border-border bg-muted/30 p-6 space-y-3">
              <p className="text-sm font-medium text-foreground">Liens utiles pour gérer les cookies :</p>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>Chrome : Paramètres &gt; Confidentialité et sécurité &gt; Cookies</li>
                <li>Firefox : Options &gt; Vie privée et sécurité &gt; Cookies</li>
                <li>Safari : Préférences &gt; Confidentialité &gt; Cookies</li>
                <li>Edge : Paramètres &gt; Cookies et autorisations de site</li>
              </ul>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Note :</strong> la désactivation des cookies essentiels
              peut empêcher le bon fonctionnement de la Plateforme et rendre certaines fonctionnalités
              inaccessibles.
            </p>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">4. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Pour toute question relative à notre utilisation des cookies, vous pouvez nous contacter :
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-6 space-y-2">
              <p className="text-sm text-muted-foreground">Email : dpo@faitierehub.com</p>
              <p className="text-sm text-muted-foreground">Adresse : Boulevard du 13 Janvier, Lomé, Togo</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
