/**
 * What the street says, in bubbles over the passers-by: the gbairai of the day (togo-buzz.ts),
 * the Cardinal's messe (his teaser in the week, « chut » during the Sunday live, his revelations
 * afterwards), the students' bourse and exams, the police's reminders of the highway code.
 *
 * Original lines written for the game. The only character named is the invented Cardinal: no
 * real person, party, faith or ethnic group (tests/haroolife-street-talk.test.ts). Pure: the same
 * lines for everyone of a background at a given time.
 */
import { inSaid, messeState, rumourOfDay } from '../togo-buzz'

export type Speaker = 'habitant' | 'etudiant' | 'police'

export interface StreetLine {
  who: Speaker
  text: string
}

/** Passers-by of the street who are students (StreetWorld's first names). */
export const STUDENT_NAMES: readonly string[] = ['Enyonam', 'Yao']

export const isStudent = (name: string) => STUDENT_NAMES.includes(name)

export const STUDENT_LINES: string[] = [
  'La bourse arrive « la semaine prochaine ». Ça fait trois semaines prochaines.',
  'Partiel demain à 7 h. J’ai photocopié tout le cours, il reste juste à le lire.',
  'Amphi plein à 6 h 30. Ceux de 7 h suivent le cours par la fenêtre.',
  'Délestage pendant les révisions : ce soir, je révise sous le lampadaire du carrefour.',
  'Mémoire à rendre vendredi. Le cybercafé a la connexion, mais pas le courant.',
  'On est quatre dans la chambre et il y a un seul ventilateur. On tourne, comme lui.',
]

export const POLICE_LINES: string[] = [
  'Au feu rouge, on s’arrête avant les bandes blanches !',
  'Casque attaché sur le zém, s’il vous plaît.',
  'Piétons : on traverse au vert, sur le passage.',
]

/** The messe as the street talks about it, from the teaser to the sermon. */
function messeLines(now: number): string[] {
  const s = messeState(now)
  if (s.phase === 'week')
    return [
      `⛪ ${s.teaser}`,
      `⛪ La messe du Cardinal, c’est ${inSaid(s.startsIn)}. Tu vas suivre ?`,
    ]
  if (s.phase === 'soon')
    return [`⛪ La messe du Cardinal commence ${inSaid(s.startsIn)} ! Charge ton téléphone.`]
  const last = s.revealed[s.revealed.length - 1]
  if (s.phase === 'live')
    return ['⛪ Chut ! Le Cardinal fait la messe en direct.', `⛪ Il vient de dire : ${last}`]
  return [`⛪ Tu as suivi la messe ? Le Cardinal a dit : ${last}`, `⛪ ${s.revealed[0]}`]
}

/**
 * Everything the street says right now, in turn order for each kind of speaker. During the
 * Sunday live the messe comes first: that hour, the whole street talks about it.
 */
export function streetLines(now: number, origin?: string | null): StreetLine[] {
  const own = rumourOfDay(now, origin)
  const common = rumourOfDay(now)
  const gossip = [own, ...(common.id === own.id ? [] : [common])].map(
    (r) => `🗣️ Tu as entendu ? ${r.text}`,
  )
  const messe = messeLines(now)
  const live = messeState(now).phase === 'live'
  const neighbours = live
    ? messe.flatMap((m, i) => [m, ...(gossip[i] ? [gossip[i]] : [])])
    : [...gossip, ...messe]
  return [
    ...neighbours.map((text) => ({ who: 'habitant' as const, text })),
    ...[...(live ? messe.slice(0, 1) : []), ...STUDENT_LINES].map((text) => ({
      who: 'etudiant' as const,
      text,
    })),
    ...POLICE_LINES.map((text) => ({ who: 'police' as const, text })),
  ]
}

/** One piece of news for a conversation (« Quoi de neuf ? »): the gbairai, or the live. */
export function streetNews(now: number, origin?: string | null): string {
  const s = messeState(now)
  const rumour = rumourOfDay(now, origin)
  if (s.phase === 'live')
    return `Chut, le Cardinal fait la messe en direct ! Il vient de dire : ${s.revealed[s.revealed.length - 1]}`
  return `Tu n’as pas entendu ? ${rumour.text} ${
    s.phase === 'done'
      ? `Et à la messe, le Cardinal a dit : ${s.revealed[s.revealed.length - 1]}`
      : `Et la messe du Cardinal, c’est ${inSaid(s.startsIn)}.`
  }`
}
