/**
 * Numéro de carte : forme acceptée. Module volontairement sans dépendance, pour
 * que cette règle — qui décide quelles chaînes touchent la base — se teste seule.
 */
export function normalizedCardNumber(value: string): string | null {
  const card = value.trim().toUpperCase()
  return /^[A-Z0-9]{2,5}-\d{4,6}$/.test(card) ? card : null
}
