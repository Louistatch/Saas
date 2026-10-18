/**
 * The vehicles of Lomé, modelled in Blender at real proportions (tools/blender/haroolife_vehicles.py):
 * the yellow taxi, a private sedan and the minibus with its loaded roof rack. They keep the
 * conventions of the Kenney car kit they replace: front towards +Z, the four wheels as separate
 * nodes named wheel-front-left… (pivot at the hub), one material per colour.
 */
export type CarKind = 'taxi' | 'sedan' | 'van'

export const VEHICLE_URL: Record<CarKind, string> = {
  taxi: '/haroolife/vehicles/taxi-lome.glb',
  sedan: '/haroolife/vehicles/berline.glb',
  van: '/haroolife/vehicles/minibus.glb',
}

/** Length on the street, in metres at the adult's scale; the models keep their proportions. */
export const VEHICLE_LENGTH: Record<CarKind, number> = { taxi: 4.1, sedan: 4.1, van: 4.5 }
