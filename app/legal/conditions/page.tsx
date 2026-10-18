import { publicPageMetadata } from '@/lib/seo'

export const metadata = publicPageMetadata('/legal/conditions')
import { MarketingLayout } from '@/components/shared/marketing-layout'

export default function ConditionsPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
          Conditions générales d&apos;utilisation
        </h1>
        <p className="text-muted-foreground mb-12">Dernière mise à jour : 18 octobre 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
          {/* Objet */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. Objet</h2>
            <p className="text-muted-foreground leading-relaxed">
              Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») ont pour
              objet de définir les modalités et conditions d&apos;accès et d&apos;utilisation de la
              plateforme FaîtiereHub (ci-après « la Plateforme »), éditée et exploitée par la
              société FaîtiereHub SARL, immatriculée au Registre du Commerce et du Crédit Mobilier
              de Lomé.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              La Plateforme est un service en ligne de gestion destiné aux faîtières, fédérations et
              coopératives agricoles, permettant notamment la gestion des membres, l&apos;émission
              de cartes numériques, le suivi des exploitations et la facilitation des échanges
              commerciaux.
            </p>
          </div>

          {/* Inscription */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">2. Inscription et accès</h2>
            <p className="text-muted-foreground leading-relaxed">
              L&apos;accès à la Plateforme nécessite la création d&apos;un compte utilisateur.
              L&apos;inscription est ouverte aux personnes majeures selon le parcours choisi :
              organisation agricole, Opérateur ou professionnel Haroo. Le représentant d&apos;une
              organisation doit être habilité à agir pour celle-ci. Un compte Opérateur ne confère
              aucun droit sur une organisation sans certification et mandat explicite.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              L&apos;utilisateur s&apos;engage à fournir des informations exactes, complètes et à
              jour lors de son inscription et à les maintenir actualisées. Tout compte créé avec des
              informations frauduleuses pourra être suspendu ou supprimé sans préavis.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              L&apos;utilisateur est responsable de la confidentialité de ses identifiants de
              connexion et de toute activité effectuée depuis son compte.
            </p>
          </div>

          {/* Obligations */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">3. Obligations des utilisateurs</h2>
            <p className="text-muted-foreground leading-relaxed">
              L&apos;utilisateur s&apos;engage à :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Utiliser la Plateforme conformément à sa destination et aux présentes CGU</li>
              <li>
                Ne pas porter atteinte à la sécurité, l&apos;intégrité ou la disponibilité de la
                Plateforme
              </li>
              <li>
                Ne pas collecter ou extraire des données d&apos;autres utilisateurs sans
                autorisation
              </li>
              <li>
                Ne pas utiliser la Plateforme à des fins illicites, frauduleuses ou contraires à
                l&apos;ordre public
              </li>
              <li>Respecter les droits de propriété intellectuelle de FaîtiereHub et des tiers</li>
              <li>
                Signaler sans délai toute faille de sécurité ou utilisation non autorisée de son
                compte
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              FaîtiereHub se réserve le droit de suspendre ou résilier l&apos;accès de tout
              utilisateur ne respectant pas ces obligations, sans préjudice de tout dommage et
              intérêt.
            </p>
          </div>

          {/* Propriété intellectuelle */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">4. Propriété intellectuelle</h2>
            <p className="text-muted-foreground leading-relaxed">
              La Plateforme, son architecture, son code source, ses interfaces, ses bases de
              données, ses contenus éditoriaux, ses marques et logos sont la propriété exclusive de
              FaîtiereHub SARL et sont protégés par les lois togolaises et internationales relatives
              à la propriété intellectuelle.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              L&apos;utilisateur conserve la propriété des données qu&apos;il saisit sur la
              Plateforme. Il accorde à FaîtiereHub une licence non exclusive, limitée au traitement
              nécessaire à la fourniture du service.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Toute reproduction, représentation, modification ou exploitation non autorisée de tout
              ou partie de la Plateforme est strictement interdite et constitue une contrefaçon
              sanctionnée par la loi.
            </p>
          </div>

          {/* Achats en ligne */}
          <div className="space-y-4" id="achats">
            <h2 className="text-2xl font-bold text-foreground">
              5. Achats en ligne : comptes d&apos;exploitation et certification Opérateur
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              La Plateforme vend des comptes d&apos;exploitation (fichiers PDF, Word ou Excel) et
              perçoit les frais de certification des Opérateurs (15 000 FCFA, dus une seule fois,
              après la réussite de l&apos;évaluation pratique). Le prix est affiché en francs CFA
              (XOF) avant le paiement.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong>Paiement.</strong> Il passe par FedaPay (Mobile Money ou carte). FaîtiereHub
                ne conserve aucune donnée de carte. L&apos;achat n&apos;est confirmé qu&apos;après
                validation du paiement par FedaPay.
              </li>
              <li>
                <strong>Livraison.</strong> Un compte d&apos;exploitation se télécharge dès la
                confirmation, depuis la page de l&apos;achat (lien envoyé par e-mail quand une
                adresse est fournie). Chaque lien de téléchargement vaut une heure et se renouvelle
                depuis cette page. L&apos;accès reste ouvert à l&apos;acheteur même si le compte est
                ensuite retiré de la vente.
              </li>
              <li>
                <strong>Nature des documents.</strong> Un compte d&apos;exploitation est
                prévisionnel : il repose sur des hypothèses de rendement, de prix et de coûts. Il
                aide à décider ; il ne garantit aucun résultat.
              </li>
              <li>
                <strong>Remboursement.</strong> Un contenu numérique fourni immédiatement ne peut
                plus être retourné une fois téléchargé. Si le paiement a été débité sans accès au
                fichier, ou si le fichier est illisible, écrivez à support@faitierehub.com dans les
                14 jours : nous fournissons le fichier ou remboursons. Un paiement en double est
                remboursé. Les frais de certification ne sont plus remboursables une fois la
                certification délivrée.
              </li>
              <li>
                <strong>Usage.</strong> Le document est destiné à l&apos;acheteur et à son
                organisation. Sa revente ou sa diffusion publique est interdite.
              </li>
            </ul>
          </div>

          {/* Résiliation */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">6. Résiliation</h2>
            <p className="text-muted-foreground leading-relaxed">
              L&apos;utilisateur peut résilier son compte à tout moment depuis les paramètres de son
              espace personnel ou en adressant une demande à support@faitierehub.com.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              FaîtiereHub peut résilier ou suspendre l&apos;accès d&apos;un utilisateur en cas de :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Violation des présentes CGU</li>
              <li>Non-paiement des sommes dues après mise en demeure restée infructueuse</li>
              <li>Utilisation frauduleuse ou abusive de la Plateforme</li>
              <li>Demande d&apos;une autorité judiciaire ou administrative compétente</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              En cas de résiliation, l&apos;utilisateur peut demander l&apos;export de ses données
              dans un délai de 30 jours. Passé ce délai, les données seront supprimées conformément
              à notre politique de confidentialité.
            </p>
          </div>

          {/* Droit applicable */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">
              7. Droit applicable et juridiction
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Les présentes CGU sont régies par le droit togolais. Tout litige relatif à leur
              interprétation ou à leur exécution sera soumis à la compétence exclusive des tribunaux
              de Lomé, Togo, sauf disposition légale impérative contraire.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              En cas de litige, les parties s&apos;engagent à rechercher une solution amiable avant
              toute action judiciaire. La médiation pourra être proposée conformément aux règles de
              l&apos;Organisation pour l&apos;Harmonisation en Afrique du Droit des Affaires
              (OHADA).
            </p>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">8. Contact</h2>
            <div className="rounded-lg border border-border bg-muted/30 p-6 space-y-2">
              <p className="text-foreground font-medium">FaîtiereHub</p>
              <p className="text-sm text-muted-foreground">TATCHIDA Louis — Fondateur</p>
              <p className="text-sm text-muted-foreground">Lomé, Togo</p>
              <p className="text-sm text-muted-foreground">Tél : +228 92 54 88 38</p>
              <p className="text-sm text-muted-foreground">Email : contact@faitierehub.com</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
