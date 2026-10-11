import type { HubId, TerritoryWorld } from './territory-simulation'

/**
 * Stylised districts share real city labels/locations with the map; their
 * geometry is illustrative, NOT a reconstruction of actual local buildings.
 */
export const DISTRICT_SCENES: Record<
  HubId,
  {
    title: string
    subtitle: string
    terrain: string
    building: string
    district: 'coast' | 'farmland' | 'market' | 'highlands' | 'savanna'
  }
> = {
  lome: {
    title: 'Portes du marché',
    subtitle: 'Livraisons et débouchés commerciaux (simulation)',
    terrain: '#75aa78',
    building: '#e5d0b3',
    district: 'coast',
  },
  kpalime: {
    title: 'Terres & ateliers',
    subtitle: 'Parcelles, transformation et logistique (simulation)',
    terrain: '#6caa63',
    building: '#dca76b',
    district: 'farmland',
  },
  sokode: {
    title: 'Carrefour des échanges',
    subtitle: 'Vue conceptuelle du futur réseau commercial',
    terrain: '#a9af73',
    building: '#dbc39f',
    district: 'market',
  },
  kara: {
    title: 'Quartier de production',
    subtitle: 'Vue conceptuelle des activités locales',
    terrain: '#91ad76',
    building: '#cba47b',
    district: 'highlands',
  },
  dapaong: {
    title: 'Place des entrepreneurs',
    subtitle: 'Vue conceptuelle des activités locales',
    terrain: '#c2a26b',
    building: '#d8b188',
    district: 'savanna',
  },
}

export function visualSignals(hub: HubId, world: TerritoryWorld) {
  return {
    // Kpalimé is the only city with an investment chain in the MVP.
    canDevelop: hub === 'kpalime',
    irrigated: hub === 'kpalime' && world.projects.irrigation,
    factoryBuilt: hub === 'kpalime' && world.projects.factory,
    solarBuilt: hub === 'kpalime' && world.projects.solar,
    truckAvailable: (hub === 'kpalime' || hub === 'lome') && world.projects.truck,
    delivered: hub === 'lome' && world.soldKg > 0,
  }
}
