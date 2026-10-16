/** Shared by the engine and the actual furniture; no renderer or runtime life import. */
import type { CityAction } from './life'
import type { Lot, LotType } from './world'
const SERVICE_ACTIONS: Record<
  NonNullable<Lot['service']>,
  { id: CityAction; label: string; hint: string }[]
> = {
  fuel: [
    {
      id: 'fuel',
      label: 'Faire le plein',
      hint: 'Prix et litres affichés avant paiement · automatique en service',
    },
  ],
  garage: [
    {
      id: 'maintain',
      label: 'Entretenir mon véhicule',
      hint: 'Vidange, freins et pneus · automatique en service',
    },
  ],
  police: [
    {
      id: 'police',
      label: 'Parler à la brigade',
      hint: 'Sécurité routière, papiers et signalement fictif',
    },
  ],
}
/** Actions a lot offers, in display order. */
export function actionsFor(
  t: LotType,
  service?: Lot['service'],
): { id: CityAction; label: string; hint: string }[] {
  if (service) return SERVICE_ACTIONS[service]
  const social = {
    id: 'socialize' as const,
    label: 'Rencontrer les habitants',
    hint: 'Social +15 · une fois par jour et par lieu',
  }
  const browse = {
    id: 'browse' as const,
    label: 'Choisir mes achats',
    hint: 'Repas togolais, eau, provisions et savon · argent du jeu',
  }
  switch (t) {
    case 'shop':
      return [browse, { id: 'buy-meal', label: 'Repas à emporter', hint: '650 FCFA' }, social]
    case 'market':
      return [
        browse,
        social,
        { id: 'buy-meal', label: 'Acheter un repas', hint: '650 FCFA' },
        {
          id: 'offers',
          label: 'Voir les offres de producteurs',
          hint: 'Préventes réelles (Haroo)',
        },
      ]
    case 'house':
    case 'apartment':
      return [
        social,
        { id: 'relax', label: 'S’asseoir chez un voisin', hint: 'Loisir +25' },
        { id: 'toilet', label: 'Toilettes', hint: 'Vessie 100' },
      ]
    case 'sport':
    case 'stadium':
      return [
        {
          id: 'use-treadmill',
          label: 'Tapis de course',
          hint: 'Forme +6 · Énergie −15 · 500 FCFA',
        },
        { id: 'use-weights', label: 'Musculation', hint: 'Forme +8 · Énergie −20 · 500 FCFA' },
        { id: 'use-bike', label: 'Vélo', hint: 'Forme +4 · Énergie −10 · 500 FCFA' },
        { id: 'use-yoga', label: 'Yoga', hint: 'Loisir +12 · Forme +3' },
        { id: 'coach', label: 'Coach', hint: 'Forme +5 · 1 000 FCFA' },
        { id: 'use-shower', label: 'Douche', hint: 'Hygiène +40' },
        { id: 'train', label: 'S’entraîner', hint: 'Loisir +20 · Énergie −15 · 500 FCFA' },
        { id: 'toilet', label: 'Toilettes', hint: 'Vessie 100' },
        social,
      ]
    case 'worship':
      return [
        { id: 'pray', label: 'Prier avec la communauté', hint: 'Social +20 · Loisir +10' },
        social,
      ]
    case 'hospital':
      return [
        { id: 'care', label: 'Consultation', hint: 'Énergie +30 · Hygiène +20 · 1 500 FCFA' },
        { id: 'toilet', label: 'Toilettes', hint: 'Vessie 100' },
      ]
    case 'school':
    case 'university':
      return [{ id: 'learn', label: 'Suivre un cours', hint: 'Compétence +1 · 1 000 FCFA' }]
    case 'hotel':
      return [
        {
          id: 'rest',
          label: 'Prendre une chambre',
          hint: 'Énergie 100 · Hygiène 100 · 3 000 FCFA',
        },
      ]
    case 'bank':
      return [{ id: 'bank', label: 'Voir mon compte', hint: 'Solde et dépenses' }]
    case 'cooperative':
      return [
        {
          id: 'coop',
          label: 'Tableau de bord de la coopérative',
          hint: 'Membres, superficies, regroupements, besoins en ouvriers',
        },
      ]
    case 'park':
    case 'port':
      return [{ id: 'relax', label: 'Se détendre', hint: 'Loisir +25' }, browse, social]
    case 'townhall':
      return [
        {
          id: 'work-city',
          label: 'Service communal',
          hint: '+1 500 FCFA · Énergie −20 · une fois par jour',
        },
      ]
    case 'station':
      return [
        {
          id: 'work-city',
          label: 'Livrer et trier les colis',
          hint: '+2 000 FCFA · Énergie −20 · une fois par jour',
        },
      ]
    case 'industry':
      return [
        {
          id: 'work-city',
          label: 'Charger les produits agricoles',
          hint: '+2 200 FCFA · Énergie −25 · une fois par jour',
        },
      ]
    default:
      return []
  }
}
