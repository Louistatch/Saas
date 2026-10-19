import Link from 'next/link'

/** Visible, server-rendered editorial content, exclusive to the home page. */
export function AgriculturalContext() {
  return (
    <section
      aria-labelledby="agriculture-togo"
      className="border-t border-border bg-primary/5 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
          Au service du terrain
        </p>
        <h2
          id="agriculture-togo"
          className="max-w-3xl text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          La gestion coopérative agricole au Togo, au plus près des producteurs
        </h2>
        <p className="mt-6 text-base leading-8 text-muted-foreground">
          Au Togo, la gestion coopérative agricole commence par des besoins concrets : connaître ses
          membres, retrouver une cotisation, situer une parcelle et préparer une campagne. Entre une
          faîtière, une union et une coopérative, les informations circulent souvent sur plusieurs
          supports. FaîtiereHub aide les responsables à organiser ce suivi dans un même espace, avec
          des accès adaptés à leur rôle. Le producteur reste au centre du parcours : ses activités
          et son territoire donnent du sens aux données enregistrées. L’objectif est de faciliter le
          travail quotidien des équipes, tout en gardant un lien avec les réalités de chaque
          localité.
        </p>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Numérisation des filières agricoles et organisation des membres
            </h3>
            <p className="leading-7 text-muted-foreground">
              La numérisation des filières agricoles repose sur des informations lisibles et suivies
              dans le temps. Les responsables peuvent réunir les dossiers des membres, suivre les
              cotisations et consulter les activités de leur organisation. Les données collectées
              sur le terrain, notamment avec KoboToolbox, contribuent à limiter les doubles saisies.
              Une organisation comme la Fédération Nationale des Organisations de Maraîchers du Togo
              (FENOMAT) illustre l’importance de relier les acteurs du maraîchage à plusieurs
              niveaux. Chaque structure conserve son périmètre de gestion et les droits de ses
              utilisateurs. Ces outils soutiennent le travail des équipes ; la qualité du suivi
              dépend aussi de la mise à jour des informations et de leur vérification auprès des
              membres.
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Une carte membre agricole QR code pour le terrain
            </h3>
            <p className="leading-7 text-muted-foreground">
              La carte membre agricole QR code associe une identité à un moyen simple de
              vérification. Après un scan, la page de vérification permet de consulter les
              informations prévues pour cet usage et le statut de la carte. Les données privées
              restent soumises aux contrôles d’accès de la plateforme. Les cartes professionnelles
              Haroo complètent ce parcours pour les ouvriers agricoles, les acheteurs et les
              agronomes. Elles permettent de présenter un profil et de faciliter la prise de
              contact. Une carte aide à identifier son titulaire ; elle ne remplace ni un contrat de
              travail, ni la vérification des conditions d’une mission entre les personnes
              concernées.
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Marché agricole de proximité : canton, préfecture et région
            </h3>
            <p className="leading-7 text-muted-foreground">
              Un marché agricole de proximité devient plus utile quand la recherche tient compte du
              canton, de la préfecture et de la région. Les producteurs et professionnels peuvent y
              partager des préventes de récoltes, des offres d’emploi et des besoins de conseil. Un
              acheteur repère les productions qui l’intéressent ; un ouvrier cherche une activité
              compatible avec ses compétences et sa disponibilité. Le prix, le volume, le calendrier
              et les modalités de livraison se précisent ensuite avec l’auteur de l’annonce. Pour
              découvrir ces échanges et les opportunités publiées, consultez le{' '}
              <Link
                href="/marche"
                className="font-medium text-primary underline underline-offset-4"
              >
                marché de proximité
              </Link>
              .
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Préparer une campagne avec des références adaptées
            </h3>
            <p className="leading-7 text-muted-foreground">
              Avant de démarrer une culture, un compte d’exploitation prévisionnel aide à rapprocher
              les charges, les rendements envisagés et les recettes attendues. Les références
              publiées doivent être examinées selon la culture, la saison et la localité : un coût
              observé dans un canton ne représente pas automatiquement celui de toutes les
              exploitations. Sur FaîtiereHub, le visiteur consulte le catalogue, filtre les fiches
              disponibles et choisit le document qui correspond à son besoin. Les équipes
              administratives préparent les données et leur publication. Découvrez les{' '}
              <Link
                href="/marketplace"
                className="font-medium text-primary underline underline-offset-4"
              >
                comptes d’exploitation agricoles
              </Link>{' '}
              pour préparer vos échanges avec un conseiller et construire un projet fondé sur des
              hypothèses explicites.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
