// Technical fixtures only: these are not agronomic recommendations.
export const documentInput = {
  context: 'Maïs pluvial : hypothèses à vérifier sur la parcelle avec les références citées.',
  areaHa: 2,
  costs: [
    {
      id: 'semences',
      label: 'Semences',
      category: 'seed',
      quantity: 20,
      unitPrice: 1000,
      scaling: 'per_hectare',
    },
  ],
  scenarios: [
    {
      id: 'central',
      label: 'Référence',
      yieldTonnesPerHa: 3,
      salePricePerTonne: 200000,
      lossRatePercent: 10,
    },
  ],
  itinerary: [
    {
      dayStart: 0,
      dayEnd: 2,
      operation: 'Semis',
      instructions:
        'Vérifier la levée et respecter les recommandations validées du référentiel local.',
      precautions: 'Vérifier les conditions du sol et la pluie.',
    },
  ],
  sources: [
    {
      title: 'Référence de test, pas un conseil agronomique',
      url: 'https://example.org/reference',
      rights: 'open',
      checkedOn: '2026-10-21',
      notes: 'Fixture technique utilisée uniquement pour tester les documents.',
    },
  ],
}
