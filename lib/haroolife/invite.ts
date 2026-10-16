/**
 * Inviting a friend to HarooLife: the link carries the player's code (?invite=XXXXXX); the friend
 * who opens it keeps the code on their phone until their account can accept it (a new player
 * who chose a home: supabase/migrations/20261017_130000_haroolife_invites.sql). No React here.
 */
export const INVITE_STORAGE = 'haroolife.invite.v1'

/** A code as the server makes them (6 characters, no 0/O nor 1/I), or null. */
export function inviteCodeFrom(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase()
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null
}

export const inviteLink = (origin: string, code: string) =>
  `${origin.replace(/\/+$/, '')}/haroolife?invite=${encodeURIComponent(code)}`

export const inviteMessage = (link: string) =>
  `Viens jouer avec moi à HarooLife, le Togo en 3D : on travaille, on cultive, on voyage et on se parle. Sans compte, tu entres d’un geste. Avec mon lien, on gagne chacun 2 000 FCFA de jeu : ${link}`

/** WhatsApp's own share address: opens the app (or WhatsApp Web) with the message ready. */
export const whatsappHref = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
