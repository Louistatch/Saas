/**
 * Adapted from the breadth-first tile/neighbor search in dgreenheck/simcity-threejs-clone:
 * src/scripts/sim/city.js (City.findTile + City.getTileNeighbors), MIT License.
 * Original code couples the search to THREE.Group and services; this port is
 * pure TypeScript for the existing HarooLife PlayCanvas city grid.
 * See THIRD_PARTY_NOTICES.md.
 */
export type RoadPoint = { x: number; y: number }
const key = (p: RoadPoint) => p.x + ':' + p.y
export function roadNeighbours(p: RoadPoint): RoadPoint[] {
  return [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]
}
export function shortestRoadPath(
  roads: ReadonlySet<string>,
  start: RoadPoint,
  destination: RoadPoint,
): RoadPoint[] | null {
  const origin=key(start), goal=key(destination)
  if (!roads.has(origin) || !roads.has(goal)) return null
  const queue: RoadPoint[]=[start]
  const parent=new Map<string,string|null>([[origin,null]])
  const points=new Map<string,RoadPoint>([[origin,start]])
  for(let i=0;i<queue.length;i++){
    const cell=queue[i], id=key(cell)
    if(id===goal){
      const result:RoadPoint[]=[]
      let current:string|null=id
      while(current!==null){result.push(points.get(current)!);current=parent.get(current)??null}
      return result.reverse()
    }
    for(const neighbor of roadNeighbours(cell)){
      const next=key(neighbor)
      if(roads.has(next)&&!parent.has(next)){
        parent.set(next,id);points.set(next,neighbor);queue.push(neighbor)
      }
    }
  }
  return null
}
export function shortestPathToBuilding(
  roads:ReadonlySet<string>, start:RoadPoint, building:RoadPoint,
):RoadPoint[]|null{
  let best:RoadPoint[]|null=null
  for(const entrance of roadNeighbours(building)){
    const route=shortestRoadPath(roads,start,entrance)
    if(route&&(!best||route.length<best.length)) best=route
  }
  return best
}
