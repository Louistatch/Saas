import type { CityLife } from './life'
import { LOCALITIES } from './locality'
import { municipalStatus } from './street-civic'
import { STUDENT_LINES, isStudent, streetNews } from './street-talk'
import type { Lot } from './world'
export type DialogueMessage = { from: 'me' | 'npc'; text: string }
export type Contact = { affinity: number; rewardedDay: number; history: DialogueMessage[] }
export type SocialLife = Record<string, Contact>
export function decodeSocial(value: unknown): SocialLife {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const contacts: SocialLife = {}
  for (const [key, raw] of Object.entries(value).slice(-60)) {
    if (!raw || typeof raw !== 'object' || key.length > 160) continue
    const c = raw as Partial<Contact>
    contacts[key] = {
      affinity: Number.isFinite(c.affinity) ? Math.max(0, Math.min(100, c.affinity!)) : 0,
      rewardedDay: Number.isSafeInteger(c.rewardedDay) ? c.rewardedDay! : -1,
      history: Array.isArray(c.history)
        ? c.history
            .filter((m) => m && (m.from === 'me' || m.from === 'npc') && typeof m.text === 'string')
            .slice(-30)
            .map((m) => ({ from: m.from, text: m.text.slice(0, 300) }))
        : [],
    }
  }
  return contacts
}
export type Resident = {
  key: string
  name: string
  role: string
  lot?: Pick<Lot, 'type' | 'service'>
}
/** `now`: the real time, for the gbairai of the day and the Cardinal's messe (street-talk.ts). */
export function residentReply(
  resident: Resident,
  text: string,
  s: CityLife,
  now = Date.now(),
): string {
  const t = text
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (resident.lot?.type === 'townhall') {
    if (/feu|passage|pieton|repar|dossier|signaler/.test(t))
      return `${municipalStatus(s)} Va au tableau « Signaler les feux en panne ». Dépôt gratuit, équipe sous deux heures de jeu. Les photos d’inauguration ? Après la réparation, promis !`
    if (/budget|vice|pot|corrupt|promess|retard|maire/.test(t))
      return 'Moi, maire Agbavi, personnage fictif, j’avais prévu trois discours pour un seul feu ! Le quartier a voté : moins de rubans, plus de boulons. Aucun pot-de-vin : ici on suit le dossier gratuitement au tableau.'
    return 'Bienvenue à la mairie ! Je suis le maire Agbavi, personnage fictif. Feux en panne, dossiers qui prennent la poussière, promesses à rallonge : on peut en rire et les réparer. Regarde le tableau de signalement ; le service communal reste rémunéré séparément.'
  }
  if (resident.lot?.type === 'university') {
    return 'Bienvenue à l’université ! Ouvre « Objets et personnes » : emploi du temps, place de cours et secrétariat ont chacun leur bulle. Choisis le tableau pour lire les horaires ou la place libre pour suivre le cours. Pas de cours à midi : même le professeur mange !'
  }
  if (/gbairai|rumeur|cardinal|messe|quoi de neuf|nouvelle/.test(t))
    return streetNews(now, s.origin)
  if (isStudent(resident.name) && /bonjour|salut|coucou|bonsoir|ca va|bourse|etud|partiel/.test(t))
    return `Bienvenue à ${LOCALITIES[s.locality].name} ! Moi, c’est ${resident.name}, étudiant à l’université. ${STUDENT_LINES[((s.life.day % STUDENT_LINES.length) + STUDENT_LINES.length) % STUDENT_LINES.length]}`
  if (/essence|carburant|entretien|garage|taxi|zem|moto/.test(t))
    return 'En service, l’essence consommée et la réserve d’entretien sont prélevées sur chaque recette. Le véhicule rejoint automatiquement la pompe et le garage quand il en a besoin. Le détail est dans Mes finances. Ici, même le taxi ne roule pas à la bonne humeur !'
  if (
    /polic|securit|papier|controle|signal/.test(t) ||
    resident.lot?.service === 'police' ||
    resident.name.startsWith('Agent')
  )
    return 'Bonjour ! Casque pour le zémidjan, ceinture en taxi et respect des piétons. Le véhicule de service dispose de ses papiers de jeu. À pied, utilise les passages et attends le vert piéton. Premier écart : avertissement ; ensuite 500 FCFA du jeu si ton solde le permet. Choisis « À pied » sur une destination pour marcher automatiquement sur les trottoirs. Pour signaler un vrai joueur, ouvre son profil et « Signaler ».'
  if (/travail|job|metier|argent|salaire|embauch/.test(t))
    return 'Ouvre Métiers. Pour le taxi ou le zémidjan, le véhicule est fourni : monte et les clients, trajets et paiements s’enchaînent. Pour un autre métier, suis la destination indiquée et fais ton service. Le salaire est fictif, mais la pause est bien méritée !'
  if (
    /achat|achet|marche|prix|manger|faim|repas/.test(t) ||
    resident.lot?.type === 'market' ||
    resident.lot?.type === 'shop'
  )
    return 'Au comptoir : eau à 100, fruits à 200, brochettes à 300, ayimolou à 500 et akoumé à 650 FCFA du jeu. Achète, puis utilise l’article dans Mon sac. Maman Abla surveille le stock, pas ton régime !'
  if (/prie|prier|culte|mosquee|eglise/.test(t) || resident.lot?.type === 'worship')
    return 'Bienvenue. Tu peux prier et rencontrer la communauté ici, en respectant chacun. Le temps partagé améliore le social et le moral du personnage.'
  const local: Partial<Record<Lot['type'], string>> = {
    school:
      'Le bureau propose un cours : compétence +1 pour 1 000 FCFA du jeu. Garde de quoi manger avant de payer.',
    university:
      'Ici, tu peux suivre un cours et améliorer tes compétences. Le tarif est affiché avant l’action.',
    bank: 'Le compte de jeu affiche recettes, dépenses et frais du véhicule. Aucun retrait bancaire réel ici.',
    hospital:
      'La consultation coûte 1 500 FCFA du jeu et améliore énergie et hygiène. Les toilettes sont gratuites.',
    sport:
      'Choisis un appareil, puis ton personnage s’y rend. Après la séance : douche et eau. Le coach ne soulève pas les poids à ta place !',
    stadium: 'On s’entraîne ici. Choisis une activité sur les appareils, puis pense à la douche.',
    hotel:
      'La chambre coûte 3 000 FCFA du jeu : énergie et hygiène à 100. Le tarif est affiché sur le lit.',
    cooperative:
      'Le tableau ouvre les données de ta coopérative : membres, surfaces et besoins en ouvriers. Les données réelles demandent une connexion.',
    station:
      'Des colis à trier et des clients à transporter : les activités disponibles sont affichées au bureau.',
    industry:
      'Le chargement de produits agricoles est rémunéré une fois par jour. Regarde aussi les métiers et leurs horaires.',
    townhall:
      'Le service communal est rémunéré une fois par jour, entre 7 h et 19 h. Prévois un peu d’énergie.',
  }
  if (/bonjour|salut|coucou|bonsoir|comment|ca va/.test(t))
    return `Bienvenue à ${LOCALITIES[s.locality].name} ! Moi, c’est ${resident.name.split(' · ')[0]}. ${resident.lot?.type && local[resident.lot.type] ? local[resident.lot.type] : 'On peut parler du quartier, du marché, des métiers ou de la sécurité.'}`
  return (
    (resident.lot?.type && local[resident.lot.type]) ||
    'Je connais le quartier : demande-moi où acheter, comment travailler, gérer ton véhicule ou parler à la police. Doucement, on va y arriver !'
  )
}
export function converse(
  s: CityLife,
  resident: Resident,
  input: string,
  now = Date.now(),
): CityLife {
  const text = input.trim().slice(0, 200)
  if (!text) return s
  const contacts = s.social ?? {}
  const c = contacts[resident.key] ?? { affinity: 0, rewardedDay: -1, history: [] }
  const gain = c.rewardedDay !== s.life.day
  const contact: Contact = {
    affinity: Math.min(100, c.affinity + (gain ? 10 : 0)),
    rewardedDay: s.life.day,
    history: [
      ...c.history,
      { from: 'me' as const, text },
      { from: 'npc' as const, text: residentReply(resident, text, s, now) },
    ].slice(-30),
  }
  const entries = Object.entries({ ...contacts, [resident.key]: contact }).slice(-60)
  return {
    ...s,
    social: Object.fromEntries(entries),
    life: {
      ...s.life,
      needs: { ...s.life.needs, social: Math.min(100, s.life.needs.social + (gain ? 15 : 0)) },
    },
  }
}
