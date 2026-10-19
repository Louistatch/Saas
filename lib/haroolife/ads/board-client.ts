'use client'

/**
 * Billboards rented by players, from the browser: what the street shows, renting a free support
 * and reporting a post. The rules and the wallet check live in the database
 * (supabase/migrations/20261017_190000_haroolife_board_posts.sql); see ./rental.ts.
 */
import { type BoardPost, type RentHours, decodePosts } from './rental'

async function client() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** Posts on the supports of a town now; null when unavailable (the street keeps the others). */
export async function livePosts(locality: 'lome' | 'kara'): Promise<BoardPost[] | null> {
  try {
    const { data, error } = await (await client()).rpc('haroolife_board_posts_live', {
      p_locality: locality,
    })
    return error ? null : decodePosts(data)
  } catch {
    return null
  }
}

const KNOWN =
  /Connexion|maison|publier|Panneau|Durée|Titre|Message|numéro|Couleur|déjà|Deux locations|sauvegardée|Solde|Motif|propre panneau/

/** Rent a free support; the same clientId never pays twice. */
export async function rentBoard(r: {
  placement: string
  hours: RentHours
  title: string
  body: string
  palette: number
  clientId: string
}): Promise<{ post: BoardPost; price: number; duplicate: boolean } | { error: string }> {
  try {
    const { data, error } = await (await client()).rpc('haroolife_board_rent', {
      p_placement: r.placement,
      p_hours: r.hours,
      p_title: r.title,
      p_body: r.body,
      p_palette: r.palette,
      p_client_id: r.clientId,
    })
    if (error)
      return {
        error: KNOWN.test(error.message)
          ? error.message
          : 'Location impossible : vérifie ta connexion.',
      }
    const [post] = decodePosts([data])
    const d = data as { price?: number; duplicate?: boolean }
    if (!post || typeof d.price !== 'number') return { error: 'Réponse inattendue du serveur.' }
    return { post, price: d.price, duplicate: d.duplicate === true }
  } catch {
    return { error: 'Location impossible : vérifie ta connexion.' }
  }
}

/** Report a rented post (three players hide it until the team decides). */
export async function reportBoard(
  postId: string,
  reason: string,
): Promise<{ hidden: boolean } | { error: string }> {
  try {
    const { data, error } = await (await client()).rpc('haroolife_board_report', {
      p_post: postId,
      p_reason: reason,
    })
    if (error)
      return {
        error: KNOWN.test(error.message) ? error.message : 'Signalement impossible pour le moment.',
      }
    return { hidden: (data as { hidden?: boolean })?.hidden === true }
  } catch {
    return { error: 'Signalement impossible pour le moment.' }
  }
}
