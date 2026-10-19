// Faîtières et organisations paysannes nationales du Togo, pour proposer un choix au lieu d'une
// saisie libre. Liste indicative tirée de sources publiques (CTOP, FIDA, GAFSP, Banque mondiale,
// AFDI), octobre 2026 : à compléter. La saisie libre reste possible.
export interface KnownFaitiere {
  acronym: string
  name: string
  sector: string
}

export const TOGO_FAITIERES: KnownFaitiere[] = [
  {
    acronym: 'CTOP',
    name: 'Coordination togolaise des organisations paysannes et de producteurs agricoles',
    sector: 'Coordination nationale',
  },
  {
    acronym: 'REJEPPAT',
    name: 'Réseau des jeunes producteurs et professionnels agricoles du Togo',
    sector: 'Jeunes producteurs, agroécologie',
  },
  {
    acronym: 'FENOMAT',
    name: 'Fédération nationale des organisations maraîchères du Togo',
    sector: 'Maraîchage',
  },
  {
    acronym: 'FNGPC',
    name: 'Fédération nationale des groupements de producteurs de coton',
    sector: 'Coton',
  },
  {
    acronym: 'FUPROCAT',
    name: 'Fédération des unions de producteurs de café et de cacao du Togo',
    sector: 'Café, cacao',
  },
  { acronym: 'CPC', name: 'Centrale des producteurs de céréales du Togo', sector: 'Céréales' },
  {
    acronym: 'FENAPFIBVTO',
    name: 'Fédération nationale des professionnels de la filière bétail-viande du Togo',
    sector: 'Élevage',
  },
  {
    acronym: 'FEPROMAT',
    name: 'Fédération des promoteurs de l’agro-industrie du Togo',
    sector: 'Agro-industrie',
  },
  {
    acronym: 'FoPAT',
    name: 'Forum des organisations de producteurs agricoles du Togo',
    sector: 'Concertation nationale',
  },
  { acronym: 'FETAPH', name: 'FETAPH', sector: 'Horticulture' },
]

export function faitiereLabel(f: KnownFaitiere) {
  return f.name === f.acronym ? f.acronym : `${f.acronym} (${f.name})`
}
