/**
 * HarooLife's fictional Togolese social layer. Values are game balancing values only:
 * no real fare, wage, lottery, influencer account or public-service schedule is represented.
 */
export type SocialLocality = 'lome' | 'kara'
export type JobVenue = 'market' | 'bakery' | 'hall' | 'station' | 'industry' | 'shop'

export const TOGO_JOBS = {
  vendeur: { label: 'Vendeur au marché', icon: '🧺', venue: 'market', wage: 3400 },
  boulanger: { label: 'Boulanger', icon: '🥖', venue: 'bakery', wage: 4200 },
  'agent-communal': { label: 'Agent communal', icon: '🧹', venue: 'hall', wage: 3900 },
  livreur: { label: 'Livreur de quartier', icon: '📦', venue: 'station', wage: 4500 },
  'conducteur-tricycle': {
    label: 'Conducteur de tricycle',
    icon: '🛺',
    venue: 'station',
    wage: 4800,
  },
  'manutentionnaire-agricole': {
    label: 'Manutentionnaire agricole',
    icon: '🌾',
    venue: 'industry',
    wage: 4300,
  },
  couturier: { label: 'Couturier de quartier', icon: '🧵', venue: 'shop', wage: 4000 },
  'vendeur-mobile-money': {
    label: 'Agent Mobile Money',
    icon: '📱',
    venue: 'shop',
    wage: 4100,
  },
} as const satisfies Record<string, { label: string; icon: string; venue: JobVenue; wage: number }>

export type TogoJobId = keyof typeof TOGO_JOBS

export const STREET_VENDORS = [
  {
    id: 'maman-deyi-bouillie',
    name: 'Maman Deyi',
    icon: '🥣',
    offer: 'Bouillie et beignets',
    price: 400,
    lines: [
      'Mon enfant, prends chaud avant que le soleil ne se fâche.',
      'Le crédit dort, moi aussi je veux dormir.',
    ],
  },
  {
    id: 'kossi-pure-water',
    name: 'Kossi Fraîcheur',
    icon: '💧',
    offer: 'Eau fraîche',
    price: 100,
    lines: [
      'Eau glacée ! Même l’harmattan va demander pardon.',
      'Chef, hydrate-toi avant la réunion.',
    ],
  },
  {
    id: 'afi-fruits',
    name: 'Afi Fruits',
    icon: '🍍',
    offer: 'Ananas et bananes',
    price: 500,
    lines: [
      'Goûte d’abord, après tu vas toi-même appeler tes voisins.',
      'C’est doux, ce n’est pas discours de campagne.',
    ],
  },
  {
    id: 'komlan-maquis',
    name: 'Komlan du maquis',
    icon: '🍲',
    offer: 'Plat du jour',
    price: 900,
    lines: [
      'La sauce est prête, la faim n’a plus d’excuse.',
      'Assieds-toi, ici on règle les problèmes après le repas.',
    ],
  },
] as const

export type ClimateMood =
  | 'harmattan'
  | 'grande-saison-seche'
  | 'grande-mousson'
  | 'petite-saison-seche'
  | 'petite-mousson'

export function climateForMonth(month: number, locality: SocialLocality): ClimateMood {
  const m = Math.max(1, Math.min(12, Math.round(month)))
  if (locality === 'kara') {
    if (m === 12 || m <= 2) return 'harmattan'
    if (m >= 5 && m <= 9) return 'grande-mousson'
    return 'grande-saison-seche'
  }
  if (m >= 4 && m <= 7) return 'grande-mousson'
  if (m >= 9 && m <= 10) return 'petite-mousson'
  if (m === 8) return 'petite-saison-seche'
  return 'grande-saison-seche'
}

export const CLIMATE_COPY: Record<ClimateMood, { icon: string; title: string; joke: string }> = {
  harmattan: { icon: '🌫️', title: 'Harmattan', joke: 'La poussière est arrivée avant le taxi.' },
  'grande-saison-seche': {
    icon: '☀️',
    title: 'Grande saison sèche',
    joke: 'Le soleil travaille sans pause déjeuner.',
  },
  'grande-mousson': {
    icon: '🌧️',
    title: 'Grande saison des pluies',
    joke: 'Le caniveau vient de demander une promotion.',
  },
  'petite-saison-seche': {
    icon: '🌤️',
    title: 'Petite saison sèche',
    joke: 'Le linge a enfin une chance de rentrer sec.',
  },
  'petite-mousson': {
    icon: '🌦️',
    title: 'Petite saison des pluies',
    joke: 'Parapluie aujourd’hui, soleil cinq minutes après.',
  },
}

export type SocialAlert = {
  id: string
  author: string
  handle: string
  icon: string
  message: string
  sponsored?: boolean
}

/** Fictional creator posts. Handles deliberately use the `.jeu` suffix. */
export const SOCIAL_ALERTS: SocialAlert[] = [
  {
    id: 'route-kara',
    author: 'Ama la Voyageuse',
    handle: '@ama_voyage.jeu',
    icon: '🎥',
    message: 'Départ Lomé–Kara : qui a gardé une place côté fenêtre ?',
  },
  {
    id: 'marche',
    author: 'Tantie Marché',
    handle: '@tantie_marche.jeu',
    icon: '🧺',
    message: 'Le prix est doux aujourd’hui. Demain, je ne promets rien hein !',
  },
  {
    id: 'pluie',
    author: 'Koffi Météo du Coin',
    handle: '@koffi_meteo.jeu',
    icon: '🌧️',
    message: 'Si tu vois trois nuages sur Bè, rentre le linge avant de faire le direct.',
  },
  {
    id: 'jobs',
    author: 'La Voix du Quartier',
    handle: '@voix_quartier.jeu',
    icon: '📢',
    message:
      'Le dépôt cherche des bras. Travail réel dans le jeu, salaire fictif à la fin du service.',
  },
]

export function socialAlertFor(
  day: number,
  hour: number,
  locality: SocialLocality,
): SocialAlert | null {
  if (hour < 7 || hour > 21 || (day * 13 + hour * 7) % 5 !== 2) return null
  return SOCIAL_ALERTS[(day + hour + (locality === 'kara' ? 1 : 0)) % SOCIAL_ALERTS.length]
}

export type PrayerMoment = {
  id: 'matin' | 'midi' | 'soir'
  label: string
  from: number
  to: number
}
export const PRAYER_MOMENTS: PrayerMoment[] = [
  { id: 'matin', label: 'Recueillement du matin', from: 5, to: 8 },
  { id: 'midi', label: 'Pause de midi', from: 12, to: 14 },
  { id: 'soir', label: 'Recueillement du soir', from: 18, to: 21 },
]
export const prayerMomentAt = (hour: number) =>
  PRAYER_MOMENTS.find((p) => hour >= p.from && hour < p.to) ?? null

export const AIR_ROUTES = {
  'lome>kara': { from: 'Aéroport de Lomé', to: 'Aéroport de Niamtougou', hours: 1, fare: 18000 },
  'kara>lome': { from: 'Aéroport de Niamtougou', to: 'Aéroport de Lomé', hours: 1, fare: 18000 },
} as const

export const PUBLIC_SERVICE_ALERTS = [
  {
    id: 'ceet',
    icon: '🔌',
    title: 'Courant en promenade',
    message: 'La CEET dit que ça revient bientôt. Ton ventilateur garde espoir.',
  },
  {
    id: 'tde',
    icon: '🚰',
    title: 'Eau en congé',
    message: 'La TdE répare le réseau. Les bassines deviennent soudain stratégiques.',
  },
  {
    id: 'lonato',
    icon: '🎟️',
    title: 'Kiosque LONATO',
    message:
      'Le kiosque affiche les résultats. HarooLife ne vend aucun pari et ne promet aucun gain.',
  },
] as const
