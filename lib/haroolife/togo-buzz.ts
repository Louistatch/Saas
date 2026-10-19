/**
 * Le « gbairai » (le buzz, la rumeur du quartier) et la messe du dimanche soir.
 *
 * Ce qu'on raconte au Togo en riant de ce qu'on vit : le repas unique (« 0-0-1 »), le rêve de
 * partir (« Mayi Essimé ! », la loterie DV, décrite comme une obsession nationale par Charles
 * Piot, « The Fixer », 2019), les délestages de la CEET (moins de coupures mais plus longues,
 * bilan officiel de juillet 2026), les routes abîmées et les chantiers arrêtés (boulevard en
 * travaux à l'arrêt depuis trois ans, février 2026), les caniveaux bouchés à la saison des pluies
 * (avril et juin 2026), la bourse des étudiants qui tombe en retard. Chaque milieu de départ du jeu
 * (city/arrival.ts) a ses rumeurs.
 *
 * Le Cardinal est un personnage inventé pour le jeu : chaque dimanche à 20 h (heure de Lomé), il
 * fait « la messe », un direct où il « révèle » des secrets… de la vie de tous les jours. Il ne
 * parle jamais d'un parti, d'un ministre, d'une personne réelle, d'une ethnie ni d'une foi ; il ne
 * reprend ni le nom ni les propos d'un journaliste réel. tests/haroolife-togo-buzz.test.ts y veille.
 * Textes originaux écrits pour le jeu. Pur.
 */

/** The player's family background (city/arrival.ts ORIGINS), or everyone. */
export type Layer =
  | 'tous'
  | 'nana-benz'
  | 'diaspora'
  | 'fonctionnaire'
  | 'tontine'
  | 'enseignant'
  | 'village'

export interface Rumour {
  id: string
  layer: Layer
  /** Where it is whispered. */
  where: string
  text: string
}

export const RUMOURS: Rumour[] = [
  {
    id: 'ceet-nuit',
    layer: 'tous',
    where: 'Dans la cour commune',
    text: 'La CEET aurait promis du courant toute la nuit. Par sécurité, le quartier a quand même chargé tous les téléphones à 18 h.',
  },
  {
    id: 'chantier-ouvrier',
    layer: 'tous',
    where: 'Au carrefour',
    text: 'Le chantier du carrefour aurait repris. Un témoin a vu un ouvrier… en train de regarder le trou.',
  },
  {
    id: 'nid-de-poule',
    layer: 'tous',
    where: 'Sur la grande route',
    text: 'Un nid-de-poule de la grande route a eu des petits. On en compte trois de plus depuis la pluie de mardi.',
  },
  {
    id: 'dv-cousin',
    layer: 'tous',
    where: 'Devant la boutique',
    text: 'Quelqu’un du quartier aurait gagné la DV. Depuis ce matin, tout le monde est son cousin.',
  },
  {
    id: 'mayi-essime',
    layer: 'tous',
    where: 'Au maquis',
    text: 'Le voisin qui crie « Mayi Essimé ! » depuis des années a encore reporté le voyage. Raison officielle : la valise n’est pas pleine.',
  },
  {
    id: 'taxi-quatre',
    layer: 'tous',
    where: 'À la station de taxis',
    text: 'On a vu un taxi rouler avec seulement quatre passagers. Les autres chauffeurs veulent savoir qui l’a autorisé.',
  },
  {
    id: 'caniveau',
    layer: 'tous',
    where: 'Au bord du caniveau',
    text: 'Il paraît que la pluie arrive ce soir. Les caniveaux, eux, n’ont pas encore été prévenus.',
  },
  {
    id: 'pagne-prix',
    layer: 'nana-benz',
    where: 'Au Grand Marché',
    text: 'Une maman aurait vendu un pagne au prix affiché. Les autres vendeuses ont convoqué une réunion d’urgence.',
  },
  {
    id: 'gari-prix',
    layer: 'nana-benz',
    where: 'Au Grand Marché',
    text: 'Le prix du gari a encore monté. La vendeuse dit que c’est le marché ; le marché dit que c’est la vendeuse.',
  },
  {
    id: 'tonton-decembre',
    layer: 'diaspora',
    where: 'Dans le groupe WhatsApp de la famille',
    text: 'Tonton de Paris rentre en décembre. La famille a déjà fait la liste des cadeaux ; lui n’a pas encore le billet.',
  },
  {
    id: 'fetes-prix',
    layer: 'diaspora',
    where: 'Au maquis du bord de mer',
    text: 'La diaspora rentre pour les fêtes : les prix des maquis l’ont appris avant les familles.',
  },
  {
    id: 'salaire-25',
    layer: 'fonctionnaire',
    where: 'Au bureau',
    text: 'Le salaire tomberait le 25. Le 24, le service est déjà « en réunion »… au maquis d’en face.',
  },
  {
    id: 'presidente-numero',
    layer: 'tontine',
    where: 'À la réunion de tontine',
    text: 'La présidente de la tontine a changé de numéro. Panique générale. C’était juste un nouveau téléphone.',
  },
  {
    id: 'tranche-semaine',
    layer: 'enseignant',
    where: 'Au campus',
    text: 'La tranche tomberait cette semaine. Les étudiants ont déjà dépensé celle de la semaine prochaine.',
  },
  {
    id: 'tranche-releve',
    layer: 'enseignant',
    where: 'Devant l’amphi',
    text: 'Un étudiant a vu la tranche passer sur son compte. Elle n’a pas dit bonjour, elle est repartie aussitôt.',
  },
  {
    id: 'cousin-lome',
    layer: 'village',
    where: 'Au village',
    text: 'Le cousin de Lomé arrive ce week-end. Il a demandé qu’on prépare le maïs… et le ticket du retour.',
  },
  {
    id: 'reseau-case',
    layer: 'village',
    where: 'Derrière la case de grand-mère',
    text: 'Le réseau capte enfin au village : il faut tenir le téléphone à bout de bras, debout sur un pied.',
  },
]

const LOME_OFFSET_MS = 0 // Lomé vit à l'heure GMT, sans heure d'été.
const DAY = 86_400_000
const dayOf = (now: number) => Math.floor((now + LOME_OFFSET_MS) / DAY)

/**
 * The rumour of the day for a player: one from their own background every other day, the
 * neighbourhood's the rest of the time. The same for everyone of that background on a given day.
 */
export function rumourOfDay(now: number, origin?: string | null): Rumour {
  const d = dayOf(now)
  const own = RUMOURS.filter((r) => r.layer === origin)
  const all = RUMOURS.filter((r) => r.layer === 'tous')
  const pool = own.length && d % 2 === 0 ? own : all
  return pool[((d % pool.length) + pool.length) % pool.length]
}

export const rumourMessage = (r: Rumour) => `🗣️ Gbairai · ${r.where} : ${r.text}`

// ── La messe du dimanche ─────────────────────────────────────────────────────────────────────

export const CARDINAL = {
  name: 'Le Cardinal',
  about:
    'Personnage du jeu. Il parle depuis l’Europe (« essimé ! ») et dit tout savoir, surtout ce qui n’est pas encore arrivé.',
}
/** Sunday 20:00 to 21:00 in Lomé. */
export const MESSE = { day: 0, hour: 20, minutes: 60 } as const
/** One revelation every 10 minutes of the live. */
export const REVELATION_EVERY = 10

export const REVELATIONS: string[] = [
  'Révélation : le courant ne coupe pas au hasard. Il attend que le riz soit sur le feu.',
  'Dossier brûlant : la tranche des étudiants est bien partie. Elle a juste pris un zém qui ne connaît pas le chemin.',
  'Exclusivité : le chantier du carrefour avance. Le trou a été agrandi : c’est une étape.',
  'Je le tiens de source sûre : le taxi « direct » s’arrête partout, sauf là où tu descends.',
  'Information confidentielle : la vendeuse de pain connaît la date de ton salaire mieux que ton patron.',
  'Ce soir je dis tout : celui qui répond « je suis en route » vient seulement de se réveiller.',
  'Les nids-de-poule de la grande route ont fêté leur anniversaire. Personne n’était invité, tout le monde est passé dedans.',
  'Secret du marché : le « dernier prix » a un petit frère, le « vrai dernier prix ».',
  'Mayi Essimé : j’ai vu l’Europe. Il fait froid, le foufou coûte cher, et tout le monde te demande quand tu rentres.',
  'Révélation de la semaine : la DV n’a pas encore choisi. Gardez vos cousins, vous en aurez besoin.',
  'Alerte : le groupe électrogène du voisin a été vu avec un bidon vide. Sortez les bougies.',
  'On me dit que la pluie arrive. Les caniveaux ne sont pas au courant, comme d’habitude.',
  'Fuite de document : le « 0-0-1 » serait un régime. Les ventres ont fait appel.',
  'Le trésorier de la tontine est si discret que même l’argent ne sait pas où il est.',
  'Dossier : pourquoi le car de 7 h part à 10 h ? Parce que celui de 10 h part à midi.',
  'Ce que personne ne vous dit : le wifi du maquis a un mot de passe, et c’est la patronne.',
  'Scandale : le coq du voisin chante à 3 h. Il a été vu en train de regarder des vidéos jusqu’à minuit.',
  'Exclusif : la belle-mère arrive « juste pour deux jours ». Mes sources parlent de trois mois.',
]

/** What the faithful write under the live (invented players, the same every week). */
export const FAITHFUL: string[] = [
  'Amen ! 🙏',
  'Cardinal, parle encore !',
  'Le réseau a coupé, il a dit quoi ?',
  'Je savais déjà, c’est ma tante qui m’a dit.',
  'Délestage chez moi, je suis le direct à la bougie 🕯️',
  'Celle-là, c’est mon quartier 😂',
]

/** What the Cardinal lets it be known during the week, Monday to Saturday. */
export const TEASERS: string[] = [
  'Le Cardinal a fait savoir qu’il a des dossiers. Rendez-vous dimanche.',
  'Le Cardinal confirme : dimanche, il dira tout. Même ce qu’il ne sait pas encore.',
  'Mercredi déjà, et le Cardinal a parlé d’un « gros dossier ». Le quartier ne dort plus.',
  'Le Cardinal demande de recharger les forfaits avant dimanche. On ne sait jamais.',
  'Vendredi : le Cardinal aurait reçu un document. Il pèse lourd, paraît-il. C’est peut-être un sac de riz.',
  'Demain soir, la messe. Chargez vos téléphones avant le délestage.',
]
/** Sunday, before the live. */
export const SUNDAY_TEASER =
  'Ce soir à 20 h, le Cardinal fait la messe. Préparez vos cœurs et vos forfaits.'

const WEEK = 7 * DAY
// Sunday 4 January 1970, 00:00 GMT: weeks count from a Sunday.
const FIRST_SUNDAY = 3 * DAY

/** The week number (Sunday to Saturday), the same for everyone. */
export const weekOf = (now: number) => Math.floor((now + LOME_OFFSET_MS - FIRST_SUNDAY) / WEEK)

/** This week's sermon: five revelations, a different set each week. */
export function sermonOf(week: number): string[] {
  const n = REVELATIONS.length
  const step = 7 // co-prime with the pool: every revelation comes back in turn.
  const start = (((week * 5) % n) + n) % n
  return Array.from({ length: 5 }, (_, i) => REVELATIONS[(start + i * step) % n])
}

export type MesseState =
  | { phase: 'week'; teaser: string; startsIn: number }
  | { phase: 'soon'; startsIn: number }
  | { phase: 'live'; revealed: string[]; minute: number }
  | { phase: 'done'; revealed: string[] }

/**
 * Where the week stands: a teaser and the time left, the hour before (« le Cardinal va
 * parler »), the live (a revelation every 10 minutes), then the sermon until midnight.
 */
export function messeState(now: number): MesseState {
  const local = now + LOME_OFFSET_MS
  const weekStart = FIRST_SUNDAY + weekOf(now) * WEEK
  const start = weekStart + MESSE.hour * 3_600_000
  const end = start + MESSE.minutes * 60_000
  const sermon = sermonOf(weekOf(now))
  if (local >= start && local < end) {
    const minute = Math.floor((local - start) / 60_000)
    return {
      phase: 'live',
      minute,
      revealed: sermon.slice(0, Math.min(sermon.length, Math.floor(minute / REVELATION_EVERY) + 1)),
    }
  }
  if (local >= end && local < weekStart + DAY) return { phase: 'done', revealed: sermon }
  const next = local < start ? start : start + WEEK
  if (next - local <= 2 * 3_600_000) return { phase: 'soon', startsIn: next - local }
  const weekday = new Date(local).getUTCDay()
  return {
    phase: 'week',
    teaser: weekday === 0 ? SUNDAY_TEASER : TEASERS[weekday - 1],
    startsIn: next - local,
  }
}

/** « dans 2 j 5 h », « dans 45 min ». */
export function inSaid(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `dans ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `dans ${h} h ${String(min % 60).padStart(2, '0')}`
  return `dans ${Math.floor(h / 24)} j ${h % 24} h`
}

/** The line the game writes once a week, the hour before and during the live; null otherwise. */
export function messeAnnouncement(now: number): string | null {
  const s = messeState(now)
  if (s.phase === 'soon')
    return `⛪ Le Cardinal va parler : la messe commence ${inSaid(s.startsIn)} (téléphone → Débats).`
  if (s.phase === 'live')
    return '⛪ En direct : le Cardinal fait la messe. Les révélations sont dans le téléphone → Débats.'
  return null
}

export const revelationMessage = (text: string) => `⛪ Le Cardinal a dit : ${text}`
