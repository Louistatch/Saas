/**
 * Gemini API key rotation with cooldown + auto-recovery.
 *
 * Features:
 *  1. Circular rotation: key1 → key2 → key3 → key1 (never stuck)
 *  2. Per-key cooldown: when a key hits 429, it's marked "exhausted" for 60s
 *  3. Smart retry: if all keys are in cooldown, waits until the earliest
 *     cooldown expires then retries automatically
 *  4. Auto-recovery: cooldowns expire after 60s — keys come back online
 *
 * Reads GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3
 * from env. Supports up to 10 numbered keys.
 */

const COOLDOWN_MS = 60_000 // 60 seconds per-key cooldown after 429

let currentIndex = 0
const exhaustedUntil = new Map<number, number>() // keyIndex → timestamp when cooldown expires

function getAllKeys(): string[] {
  const keys: string[] = []
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim()
    if (k) keys.push(k)
  }
  if (keys.length === 0) {
    const single = process.env.GEMINI_API_KEY?.trim()
    if (single) keys.push(single)
  }
  return keys
}

/** Check if a key index is currently in cooldown. */
function isInCooldown(index: number): boolean {
  const until = exhaustedUntil.get(index)
  if (!until) return false
  if (Date.now() >= until) {
    exhaustedUntil.delete(index) // Cooldown expired — key is back
    return false
  }
  return true
}

/** Get the current active Gemini key (skipping keys in cooldown). */
export function getGeminiKey(): string | null {
  const keys = getAllKeys()
  if (keys.length === 0) return null

  // Try to find a key that's not in cooldown
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentIndex + i) % keys.length
    if (!isInCooldown(idx)) {
      currentIndex = idx
      return keys[idx]
    }
  }

  // All keys in cooldown — return the one that recovers soonest
  let soonestIdx = 0
  let soonestTime = Infinity
  for (let i = 0; i < keys.length; i++) {
    const until = exhaustedUntil.get(i) ?? 0
    if (until < soonestTime) {
      soonestTime = until
      soonestIdx = i
    }
  }
  currentIndex = soonestIdx
  return keys[soonestIdx]
}

/** Mark the current key as exhausted (429). Starts its cooldown timer. */
export function markKeyExhausted(): void {
  exhaustedUntil.set(currentIndex, Date.now() + COOLDOWN_MS)
}

/** Rotate to the next available key. Skips keys in cooldown. */
export function rotateGeminiKey(): string | null {
  const keys = getAllKeys()
  if (keys.length === 0) return null

  // Move to next key
  currentIndex = (currentIndex + 1) % keys.length

  // Skip keys in cooldown
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentIndex + i) % keys.length
    if (!isInCooldown(idx)) {
      currentIndex = idx
      return keys[idx]
    }
  }

  // All in cooldown — return next anyway (will retry after wait)
  return keys[currentIndex]
}

/** Get the total number of available keys. */
export function getKeyCount(): number {
  return getAllKeys().length
}

/** How many seconds until the next key recovers from cooldown. 0 if one is ready. */
export function getRecoveryWaitMs(): number {
  const keys = getAllKeys()
  // Check if any key is NOT in cooldown
  for (let i = 0; i < keys.length; i++) {
    if (!isInCooldown(i)) return 0
  }
  // All in cooldown — find the soonest recovery
  let soonest = Infinity
  for (let i = 0; i < keys.length; i++) {
    const until = exhaustedUntil.get(i) ?? 0
    if (until < soonest) soonest = until
  }
  return Math.max(0, soonest - Date.now())
}

/** Are ALL keys currently in cooldown? */
export function allKeysExhausted(): boolean {
  const keys = getAllKeys()
  if (keys.length === 0) return true
  return keys.every((_, i) => isInCooldown(i))
}
