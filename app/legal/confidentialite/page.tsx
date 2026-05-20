import { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — FaîtiereHub',
  description:
    'Politique de confidentialité de FaîtiereHub : données collectées, utilisation, stockage, droits des utilisateurs et contact du DPO.',
}

export default function ConfidentialitePage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
          Politique de confidentialité
        </h1>
        <p className="text-muted-foreground mb-12">
          Dernière mise à jour : 1er janvier 2025
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
          {/* Introduction */}
          <div className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              FaîtiereHub (ci-après « la Plateforme ») s&apos;engage à protéger la vie privée de ses
              utilisateurs conformément à la législation togolaise en matière de protection des données
              personnelles, aux dispositions de l&apos;Acte Additionnel A/SA.1/01/10 de la CEDEAO relatif
              à la protection des données à caractère personnel, ainsi qu&apos;au Règlement Général sur la
              Protection des Données (RGPD) pour les utilisateurs situés dans l&apos;Union Européenne.
            </p>
          </div>

          {/* Données collectées */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. Données collectées</h2>
            <p className="text-muted-foreground leading-relaxed">
              Dans le cadre de l&apos;utilisation de la Plateforme, nous collectons les catégories de données suivantes :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Données d&apos;identification :</strong> nom, prénom, adresse email, numéro de téléphone, photographie d&apos;identité.</li>
              <li><strong className="text-foreground">Données professionnelles :</strong> nom de la coopérative, rôle, localisation géographique des exploitations.</li>
              <li><strong className="text-foreground">Données d&apos;exploitation :</strong> superficies cultivées, types de cultures, rendements, intrants utilisés.</li>
              <li><strong className="text-foreground">Données de connexion :</strong> adresse IP, type de navigateur, pages visitées, horodatage des accès.</li>
              <li><strong className="text-foreground">Données financières :</strong> historique des cotisations, achats de comptes d&apos;exploitation (aucune donnée bancaire n&apos;est stockée directement).</li>
            </ul>
          </div>

          {/* Utilisation */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">2. Utilisation des données</h2>
            <p className="text-muted-foreground leading-relaxed">
              Les données collectées sont utilisées aux fins suivantes :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Fourniture et amélioration des services de la Plateforme</li>
              <li>Gestion des comptes utilisateurs et authentification</li>
              <li>Émission et vérification des cartes de membre numériques</li>
              <li>Génération de statistiques agrégées pour les faîtières</li>
              <li>Communication relative au service (notifications, mises à jour)</li>
              <li>Respect des obligations légales et réglementaires</li>
            </ul>
          </div>

          {/* Stockage */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">3. Stockage et sécurité</h2>
            <p className="text-muted-foreground leading-relaxed">
              Les données sont hébergées sur des serveurs sécurisés fournis par Supabase (infrastructure
              AWS) avec chiffrement au repos (AES-256) et en transit (TLS 1.3). Les sauvegardes sont
              effectuées quotidiennement avec une rétention de 30 jours.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              La durée de conservation des données personnelles est limitée à la durée nécessaire aux
              finalités pour lesquelles elles sont collectées, et au maximum 3 ans après la dernière
              activité du compte utilisateur.
            </p>
          </div>

          {/* Droits */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">4. Vos droits</h2>
            <p className="text-muted-foreground leading-relaxed">
              Conformément à la réglementation applicable, vous disposez des droits suivants :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Droit d&apos;accès :</strong> obtenir la confirmation du traitement de vos données et en recevoir une copie.</li>
              <li><strong className="text-foreground">Droit de rectification :</strong> demander la correction de données inexactes ou incomplètes.</li>
              <li><strong className="text-foreground">Droit à l&apos;effacement :</strong> demander la suppression de vos données dans les conditions prévues par la loi.</li>
              <li><strong className="text-foreground">Droit à la portabilité :</strong> recevoir vos données dans un format structuré et lisible par machine.</li>
              <li><strong className="text-foreground">Droit d&apos;opposition :</strong> vous opposer au traitement de vos données pour des motifs légitimes.</li>
              <li><strong className="text-foreground">Droit à la limitation :</strong> demander la limitation du traitement dans certaines circonstances.</li>
            </ul>
          </div>

          {/* Contact DPO */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">5. Contact du Délégué à la Protection des Données</h2>
            <p className="text-muted-foreground leading-relaxed">
              Pour exercer vos droits ou pour toute question relative à la protection de vos données
              personnelles, vous pouvez contacter notre Délégué à la Protection des Données (DPO) :
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-6 space-y-2">
              <p className="text-foreground font-medium">Délégué à la Protection des Données</p>
              <p className="text-sm text-muted-foreground">Email : dpo@faitierehub.com</p>
              <p className="text-sm text-muted-foreground">Adresse : Boulevard du 13 Janvier, Lomé, Togo</p>
              <p className="text-sm text-muted-foreground">
                Vous pouvez également adresser une réclamation à l&apos;autorité de protection des données
                compétente (ANCE — Autorité Nationale de la Certification Électronique, Togo).
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
