import { type LifeState, interact, jobVenue, workStatus } from '../lome-life-engine'
import { TOGO_JOBS } from '../togo-social-life'
import type { CityLife } from './life'
import { inEstate, lotById, worldLots } from './world'

export function careerWorkplace(s: CityLife) {
  const venue = TOGO_JOBS[s.life.job].venue
  const type = venue === 'hall' ? 'townhall' : venue === 'bakery' ? 'shop' : venue
  return worldLots().find((l) => l.type === type && !l.service && !l.employer) ?? null
}
function workContext(s: CityLife): LifeState {
  if (s.locality === 'lome' && (s.life.inside || inEstate(s.at.x, s.at.y))) return s.life
  const lot = s.insideLot ? lotById(s.insideLot) : null
  const expected = careerWorkplace(s)?.type
  const inside =
    lot && lot.type === expected && !lot.service && !lot.employer ? jobVenue(s.life.job) : null
  // The estate position is dormant outside Lomé; it must never make a distant job look ready.
  return { ...s.life, inside, pos: { x: -100, y: -100 } }
}
export const careerWorkStatus = (s: CityLife) => workStatus(workContext(s))
export function workCareer(s: CityLife): CityLife {
  if (s.duty || s.employment?.shift)
    return {
      ...s,
      life: {
        ...s.life,
        lastEvent: 'Termine ton service en cours avant de commencer un autre emploi.',
      },
    }
  const life = interact(workContext(s), 'work')
  return { ...s, life: { ...life, pos: s.life.pos, inside: s.life.inside } }
}
