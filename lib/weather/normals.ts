/**
 * Pluie mensuelle normale par région (mm, janvier → décembre).
 *
 * Mêmes normales que le repli d'AgriTogo (app/agrismart/climate_normals.py),
 * dérivées de la climatologie NASA POWER. Elles servent à LIRE une prévision
 * saisonnière par rapport à la normale du mois — la seule lecture fiable d'un
 * modèle saisonnier (CFS) dont les quantités brutes sont biaisées en Afrique
 * de l'Ouest.
 */
const NORMAL_RAIN_MM: Record<string, number[]> = {
  Maritime: [27, 50, 93, 117, 239, 341, 128, 46, 3, 3, 23, 45],
  Plateaux: [18, 40, 82, 129, 212, 235, 164, 68, 5, 4, 12, 28],
  Centrale: [5, 15, 55, 107, 155, 175, 188, 238, 180, 78, 5, 2],
  Kara: [2, 8, 52, 95, 158, 175, 205, 262, 185, 68, 4, 1],
  Savanes: [1, 4, 25, 65, 120, 148, 188, 275, 175, 52, 2, 1],
}

export type SeasonalOutlook = { label: string; tone: 'wet' | 'normal' | 'dry' | 'season' }

/**
 * Compare la pluie prévue à la normale du mois : au-dessus (> +20 %), proche,
 * ou en dessous (< −20 %). Un mois normalement sec (< 20 mm) reste « saison
 * sèche » : une différence de quelques millimètres n'y a pas de sens.
 */
export function seasonalOutlook(
  region: string,
  month: string,
  forecastMm: number,
): SeasonalOutlook {
  const normals = NORMAL_RAIN_MM[region] ?? NORMAL_RAIN_MM.Centrale
  const m = Number.parseInt(month.slice(5, 7), 10) - 1
  const normal = normals[m] ?? 0
  if (normal < 20) return { label: 'Saison sèche, pluie rare', tone: 'season' }
  const ratio = forecastMm / normal
  if (ratio > 1.2) return { label: 'Au-dessus de la normale', tone: 'wet' }
  if (ratio < 0.8) return { label: 'En dessous de la normale', tone: 'dry' }
  return { label: 'Proche de la normale', tone: 'normal' }
}
