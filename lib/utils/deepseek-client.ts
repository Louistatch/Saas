/**
 * DeepSeek API client avec rotation de clés et cooldown automatique.
 *
 * DeepSeek expose une API compatible OpenAI (https://api.deepseek.com).
 * Ce module remplace Gemini pour le chat/voice en Level 3b.
 *
 * Variables d'environnement :
 *   DEEPSEEK_API_KEY         — clé principale (obligatoire)
 *   DEEPSEEK_API_KEY_1..10   — clés supplémentaires (optionnel, rotation auto)
 *   DEEPSEEK_MODEL           — modèle cible (défaut: deepseek-chat)
 *
 * Modèles disponibles :
 *   deepseek-chat      — DeepSeek-V3 : rapide, excellent rapport qualité/prix
 *   deepseek-reasoner  — DeepSeek-R1 : raisonnement approfondi (conseils complexes)
 */

import OpenAI from 'openai'

const COOLDOWN_MS = 60_000 // 60s de cooldown après erreur 429

let currentIndex = 0
const exhaustedUntil = new Map<number, number>()

function getAllKeys(): string[] {
  const keys: string[] = []
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`DEEPSEEK_API_KEY_${i}`]?.trim()
    if (k) keys.push(k)
  }
  if (keys.length === 0) {
    const single = process.env.DEEPSEEK_API_KEY?.trim()
    if (single) keys.push(single)
  }
  return keys
}

function isInCooldown(index: number): boolean {
  const until = exhaustedUntil.get(index)
  if (!until) return false
  if (Date.now() >= until) {
    exhaustedUntil.delete(index)
    return false
  }
  return true
}

/** Retourne la clé active courante (ignore les clés en cooldown). */
export function getDeepSeekKey(): string | null {
  const keys = getAllKeys()
  if (keys.length === 0) return null

  for (let i = 0; i < keys.length; i++) {
    const idx = (currentIndex + i) % keys.length
    if (!isInCooldown(idx)) {
      currentIndex = idx
      return keys[idx]
    }
  }

  // Toutes en cooldown : retourner celle qui récupère le plus vite
  let soonestIdx = 0
  let soonestTime = Infinity
  for (let i = 0; i < keys.length; i++) {
    const until = exhaustedUntil.get(i) ?? 0
    if (until < soonestTime) { soonestTime = until; soonestIdx = i }
  }
  currentIndex = soonestIdx
  return keys[soonestIdx]
}

/** Marque la clé courante comme épuisée (429). Démarre son cooldown 60s. */
export function markDeepSeekKeyExhausted(): void {
  exhaustedUntil.set(currentIndex, Date.now() + COOLDOWN_MS)
}

/** Tourne vers la prochaine clé disponible. */
export function rotateDeepSeekKey(): string | null {
  const keys = getAllKeys()
  if (keys.length === 0) return null
  currentIndex = (currentIndex + 1) % keys.length
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentIndex + i) % keys.length
    if (!isInCooldown(idx)) { currentIndex = idx; return keys[idx] }
  }
  return keys[currentIndex]
}

export function getDeepSeekKeyCount(): number { return getAllKeys().length }

export function allDeepSeekKeysExhausted(): boolean {
  const keys = getAllKeys()
  if (keys.length === 0) return true
  return keys.every((_, i) => isInCooldown(i))
}

export function getDeepSeekRecoveryWaitMs(): number {
  const keys = getAllKeys()
  for (let i = 0; i < keys.length; i++) {
    if (!isInCooldown(i)) return 0
  }
  let soonest = Infinity
  for (let i = 0; i < keys.length; i++) {
    const until = exhaustedUntil.get(i) ?? 0
    if (until < soonest) soonest = until
  }
  return Math.max(0, soonest - Date.now())
}

/** Crée un client OpenAI configuré pour DeepSeek avec la clé fournie. */
export function createDeepSeekClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  })
}

/**
 * Modèle DeepSeek utilisé pour le chat et les réponses vocales.
 * Remplacer par "deepseek-reasoner" (R1) pour des analyses plus approfondies.
 */
export const DEEPSEEK_MODEL: string = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
