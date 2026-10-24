import type { ProximityRank } from '@/lib/market/work'

/**
 * Trois cercles : le canton au centre, la préfecture autour, la région à l'extérieur. Le cercle
 * de l'annonce est rempli ; « ailleurs » laisse les trois vides. Décoratif : le texte voisin dit
 * la même chose.
 */
export function ProximityMark({
  rank,
  className = 'h-4 w-4',
}: { rank: ProximityRank; className?: string }) {
  const circle = (level: 0 | 1 | 2, r: number) => (
    <circle
      cx="10"
      cy="10"
      r={r}
      fill="currentColor"
      fillOpacity={rank === level ? (level === 0 ? 1 : 0.28) : 0}
      stroke="currentColor"
      strokeOpacity={rank === level ? 1 : 0.35}
      strokeWidth="1.5"
    />
  )
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      {circle(2, 8.5)}
      {circle(1, 5.5)}
      {circle(0, 2.5)}
    </svg>
  )
}
