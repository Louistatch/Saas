/**
 * Gemini API key rotation.
 *
 * Reads GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3
 * from env. Rotates to the next key when one hits quota (429).
 *
 * Same strategy as AgriTogo's key_rotation.py — shared logic, both services
 * rotate independently so they don't exhaust the same key at the same time.
 */

let currentIndex = 0

function getAllKeys(): string[] {
  const keys: string[] = []
  // Numbered keys first (GEMINI_API_KEY_1, _2, _3)
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim()
    if (k) keys.push(k)
  }
  // Fallback to single GEMINI_API_KEY if no numbered keys
  if (keys.length === 0) {
    const single = process.env.GEMINI_API_KEY?.trim()
    if (single) keys.push(single)
  }
  return keys
}

/** Get the current active Gemini key. */
export function getGeminiKey(): string | null {
  const keys = getAllKeys()
  if (keys.length === 0) return null
  return keys[currentIndex % keys.length]
}

/** Rotate to the next key. Returns the new key, or null if none available. */
export function rotateGeminiKey(): string | null {
  const keys = getAllKeys()
  if (keys.length === 0) return null
  currentIndex = (currentIndex + 1) % keys.length
  return keys[currentIndex]
}

/** Get the total number of available keys. */
export function getKeyCount(): number {
  return getAllKeys().length
}
