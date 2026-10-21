import type { Metadata } from 'next'

// Deliberately independent of request Host and NEXT_PUBLIC_APP_URL (preview/auth URLs).
export const SITE_ORIGIN = 'https://faitierehub.com'

// Only useful, public landing pages belong in the sitemap. Never enumerate accounts,
// QR tokens, purchases or tenant records, even with a service-role client.
export const PUBLIC_PAGES = {
  '/': {
    title: 'FaîtiereHub — Gestion des coopératives agricoles au Togo',
    description:
      'Gestion des membres, cartes agricoles QR code, cotisations et marché de proximité au Togo. FaîtiereHub relie coopératives, producteurs et professionnels Haroo.',
  },
  '/produit': {
    title: 'Plateforme de gestion agricole — FaîtiereHub',
    description:
      'Découvrez les outils FaîtiereHub : gestion des coopératives, cartes membres, comptes d’exploitation et services professionnels Haroo.',
  },
  '/features': {
    title: 'Fonctionnalités pour coopératives agricoles — FaîtiereHub',
    description:
      'Membres, cotisations, parcelles, cartes QR code et suivi des activités : les fonctionnalités de FaîtiereHub pour les organisations agricoles togolaises.',
  },
  '/pricing': {
    title: 'Tarifs pour coopératives et professionnels — FaîtiereHub',
    description:
      'Sans abonnement : 250 FCFA par carte commerciale émise, crédits prépayés pour les opérateurs, formation à 15 000 FCFA. Profils Haroo sans frais.',
  },
  '/marche': {
    title: 'Marché agricole de proximité au Togo — FaîtiereHub',
    description:
      'Trouvez des préventes de récoltes, des emplois agricoles et des missions de conseil. Recherchez les opportunités par canton, préfecture et région au Togo.',
  },
  '/marketplace': {
    title: 'Comptes d’exploitation et produits agricoles — FaîtiereHub',
    description:
      'Consultez les comptes d’exploitation prévisionnels et les produits agricoles publiés. Filtrez par culture et localité avant de choisir votre fiche.',
  },
  '/agrismart': {
    title: 'AgriSmart — Besoins en eau des cultures au Togo',
    description:
      'Estimez les besoins en eau de vos cultures avec AgriSmart sur FaîtiereHub. Un bilan accessible aux producteurs et des rapports destinés aux agronomes.',
  },
  '/agronomes': {
    title: 'Agronomes et missions de conseil au Togo — FaîtiereHub',
    description:
      'Découvrez les professionnels agricoles validés du réseau Haroo et demandez une mission de conseil adaptée à votre culture et à votre localité.',
  },
  '/a-propos': {
    title: 'Notre mission pour l’agriculture togolaise — FaîtiereHub',
    description:
      'Découvrez FaîtiereHub, une plateforme conçue au Togo pour accompagner les faîtières, unions, coopératives et professionnels agricoles.',
  },
  '/entreprise': {
    title: 'Solutions pour organisations agricoles — FaîtiereHub',
    description:
      'Découvrez les solutions FaîtiereHub pour structurer une organisation agricole, accompagner les équipes et relier les acteurs du terrain.',
  },
  '/contact': {
    title: 'Contact et démonstration — FaîtiereHub, Lomé',
    description:
      'Contactez l’équipe FaîtiereHub à Lomé pour une démonstration, une question sur la plateforme ou un accompagnement de votre organisation.',
  },
  '/securite': {
    title: 'Sécurité et protection des données — FaîtiereHub',
    description:
      'Découvrez les protections des comptes, les accès aux organisations et les principes de sécurité de FaîtiereHub.',
  },
  '/haroolife': {
    title: 'HarooLife — Le Togo en 3D sur FaîtiereHub',
    description:
      'Découvrez HarooLife, une expérience de vie togolaise en 3D accessible avec votre compte FaîtiereHub. Explorez les lieux, métiers et interactions du jeu.',
  },
  '/legal/conditions': {
    title: 'Conditions d’utilisation — FaîtiereHub',
    description:
      'Conditions générales d’utilisation de FaîtiereHub : inscription, obligations, services et droit applicable.',
  },
  '/legal/confidentialite': {
    title: 'Politique de confidentialité — FaîtiereHub',
    description:
      'Données collectées, utilisation, stockage et droits des utilisateurs sur la plateforme FaîtiereHub.',
  },
  '/legal/cookies': {
    title: 'Politique cookies — FaîtiereHub',
    description:
      'Découvrez les cookies utilisés sur FaîtiereHub, leur rôle et la gestion de vos préférences.',
  },
} as const

export type PublicPagePath = keyof typeof PUBLIC_PAGES

export function publicPageMetadata(path: PublicPagePath): Metadata {
  const { title, description } = PUBLIC_PAGES[path]
  const url = new URL(path, SITE_ORIGIN).href
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'fr_TG',
      siteName: 'FaîtiereHub',
      title,
      description,
      url,
    },
    twitter: { card: 'summary', title, description },
  }
}
