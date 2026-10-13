/**
 * Accepte aussi bien l'URL complète encodée dans le QR que le numéro de carte
 * saisi à la main. Fonction pure : hors du composant, elle garde une identité
 * stable et n'a pas à figurer dans les dépendances des hooks.
 */
export function extractCardNumber(raw: string): string | null {
  const value = raw.trim()
  // URL complète pointant vers notre route de vérification
  try {
    const url = new URL(value)
    const m = url.pathname.match(/\/verify\/([^/?#]+)/i)
    if (m) return decodeURIComponent(m[1])
  } catch {
    /* pas une URL — on continue */
  }
  // Numéro de carte nu (PREFIXE-CHIFFRES)
  if (/^[A-Z]{2,5}-\d{4,6}$/i.test(value)) return value.toUpperCase()
  return null
}
