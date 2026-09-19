'use client'

import { useEffect } from 'react'

/**
 * Ramène la pagination à la première page dès qu'un critère de filtrage change.
 *
 * Sans cela, filtrer depuis la page 7 laisse l'utilisateur sur une page 7 qui
 * n'existe plus dans le résultat filtré — la liste paraît vide alors qu'elle
 * ne l'est pas.
 *
 * Ce motif met `useExhaustiveDependencies` en défaut : le corps de l'effet ne
 * capture rien, les dépendances ne sont pas des captures mais le déclencheur
 * lui-même. La règle conclut donc qu'elles sont superflues, alors que les
 * retirer supprimerait purement et simplement le comportement. On le formule
 * une fois ici, plutôt que de répéter neuf suppressions sur neuf pages.
 *
 * @param setPage  le `setState` de la pagination concernée
 * @param triggers les critères dont le changement doit ramener en page 1
 */
export function useResetPageOnChange(
  setPage: (page: number) => void,
  triggers: readonly unknown[],
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `triggers` est le déclencheur voulu, pas une capture du corps — voir la note ci-dessus
  useEffect(() => {
    setPage(1)
  }, triggers)
}
