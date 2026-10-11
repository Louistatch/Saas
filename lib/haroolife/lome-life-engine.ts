/**
 * HarooLife — Lomé life/city gameplay slice, entirely fictitious.
 * Models life needs, real player movement on connected in-game streets,
 * wages in fictional FCFA, commerce, and existing HarooVille construction.
 * No Supabase clients, payment calls, authentication mutations or real parcels.
 */
import {
  initialCity, tick as tickCity, place, removeBuilding, roadNetwork,
  decodeCity, type BuildType, type City, type Building, CATALOG,
} from './townsmen-engine'
import {
  shortestRoadPath, shortestPathToBuilding, roadNeighbours, type RoadPoint,
} from './vendor/simcity-road-path'

export type Venue='house'|'market'|'bakery'|'hall'|'well'|'park'
export type Career='vendeur'|'boulanger'|'agent-communal'
export type Action='work'|'buy-meal'|'eat'|'sleep'|'wash'|'socialize'|'enter'|'leave'
export type Needs={hunger:number;energy:number;hygiene:number;social:number}
export interface LifeState {
  version:1
  city:City
  hour:number
  day:number
  pos:RoadPoint
  route:RoadPoint[]
  target:RoadPoint|null
  inside:Venue|null
  wallet:number
  earned:number
  spent:number
  meals:number
  job:Career
  needs:Needs
  workToday:boolean
  trafficStep:number
  lastEvent:string
  events:string[]
}
export const SALARIES:Record<Career,number>={'vendeur':3400,'boulanger':4200,'agent-communal':3900}
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)))
const id=(p:RoadPoint)=>p.x+':'+p.y
const manhattan=(a:RoadPoint,b:RoadPoint)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
const venues=new Set<Venue>(['house','market','bakery','hall','well','park'])
export const LIFE_LOCATIONS:{name:string;venue:Venue; x:number;y:number}[]=[
  {name:'Chez moi',venue:'house',x:9,y:9},
  {name:'Marché de quartier',venue:'market',x:12,y:11},
  {name:'Boulangerie',venue:'bakery',x:13,y:11},
  {name:'Mairie',venue:'hall',x:11,y:10},
  {name:'Point d’eau',venue:'well',x:10,y:10},
  {name:'Jardin public',venue:'park',x:10,y:11},
]
export function initialLomeLife():LifeState {
  const city=initialCity()
  city.coins=65000
  city.wood=90
  city.food=95
  city.population=12
  city.buildings=[
    ...city.buildings,
    {x:12,y:11,type:'market'},
    {x:13,y:11,type:'bakery'},
    {x:10,y:10,type:'well'},
    {x:10,y:11,type:'park'},
    {x:12,y:13,type:'farm'},
    {x:13,y:13,type:'mill'},
  ]
  city.log=['Quartier fictif de Lomé : boutiques et services ouverts.',...city.log].slice(0,8)
  return {
    version:1,city,hour:8,day:1,pos:{x:11,y:12},route:[],target:null,
    inside:null,wallet:8000,earned:0,spent:0,meals:1,job:'vendeur',
    needs:{hunger:75,energy:85,hygiene:75,social:70},
    workToday:false,trafficStep:0,lastEvent:'Choisis un lieu, rejoins-le et interagis avec lui.',
    events:['Une nouvelle journée commence dans ton quartier fictif de Lomé.'],
  }
}
const events=(state:LifeState,msg:string):LifeState=>({
  ...state,lastEvent:msg,events:[msg,...state.events].slice(0,8),
})
export function venueAt(city:City,p:RoadPoint):Venue|null {
  const b=city.buildings.find(b=>b.x===p.x&&b.y===p.y)
  return b&&venues.has(b.type as Venue)?b.type as Venue:null
}
export function canEnter(state:LifeState,building:RoadPoint):boolean {
  if(!venueAt(state.city,building))return false
  return state.inside===null&&manhattan(state.pos,building)===1
}
export function directTo(state:LifeState,destination:RoadPoint):LifeState {
  if(state.inside)return events(state,'Sors du bâtiment avant de marcher.')
  const roads=roadNetwork(state.city.buildings)
  const b=state.city.buildings.find(b=>b.x===destination.x&&b.y===destination.y)
  const route=b&&b.type!=='road'
    ?shortestPathToBuilding(roads,state.pos,destination)
    :shortestRoadPath(roads,state.pos,destination)
  if(!route)return events(state,'Lieu inaccessible : il faut le relier aux routes de la mairie.')
  if(route.length<=1)return events({...state,target:destination,route:[]},'Tu es arrivé à destination.')
  return events({...state,target:destination,route:route.slice(1)},'Trajet commencé : '+(route.length-1)+' cases.')
}
export function selectJob(state:LifeState,job:Career):LifeState {
  return events({...state,job},'Métier choisi : '+job+'. Rejoins ton lieu de travail pour être payé.')
}
export function jobVenue(job:Career):Venue {
  return job==='vendeur'?'market':job==='boulanger'?'bakery':'hall'
}
function nearVenue(state:LifeState,venue:Venue):boolean {
  if(state.inside===venue)return true
  return state.city.buildings.some(b=>b.type===venue&&manhattan(b,state.pos)===1)
}
export function interact(state:LifeState,action:Action):LifeState {
  if(action==='leave'){
    if(!state.inside)return events(state,'Tu es déjà à l’extérieur.')
    return events({...state,inside:null},'Tu es sorti du bâtiment.')
  }
  if(action==='enter'){
    if(state.inside)return events(state,'Sors avant de changer de bâtiment.')
    // Prefer the venue the player selected. Adjacent buildings can share a door-side street.
    const targeted=state.target&&state.city.buildings.find(b=>b.x===state.target!.x&&b.y===state.target!.y)
    const building=targeted&&venues.has(targeted.type as Venue)&&manhattan(targeted,state.pos)===1
      ?targeted
      :state.city.buildings.find(b=>venues.has(b.type as Venue)&&manhattan(b,state.pos)===1)
    if(!building)return events(state,'Approche-toi de la porte d’un bâtiment accessible.')
    return events({...state,inside:building.type as Venue,route:[]},'Tu entres : '+CATALOG[building.type as BuildType]?.label+'.')
  }
  if(action==='work'){
    if(state.workToday)return events(state,'Tu as déjà effectué ton service aujourd’hui.')
    if(state.hour<7||state.hour>=19)return events(state,'Les emplois sont accessibles entre 7 h et 19 h.')
    const venue=jobVenue(state.job)
    if(!nearVenue(state,venue))return events(state,'Rejoins d’abord ton lieu de travail : '+venue+'.')
    if(state.needs.energy<16||state.needs.hunger<12)return events(state,'Mange ou repose-toi avant de travailler.')
    const salary=SALARIES[state.job]
    if(state.city.coins<salary)return events(state,'La caisse municipale ne peut pas verser le salaire fictif.')
    return events({
      ...state,wallet:state.wallet+salary,earned:state.earned+salary,workToday:true,
      needs:{...state.needs,energy:clamp(state.needs.energy-28),hunger:clamp(state.needs.hunger-18)},
      city:{...state.city,coins:state.city.coins-salary},
    },'Service terminé : +'+salary.toLocaleString('fr-FR')+' FCFA (simulation).')
  }
  if(action==='buy-meal'){
    if(!nearVenue(state,'market')&&!nearVenue(state,'bakery'))
      return events(state,'Rejoins le marché ou la boulangerie pour acheter un repas.')
    const price=650
    if(state.wallet<price)return events(state,'Solde personnel insuffisant.')
    if(state.city.food<1)return events(state,'Rupture de stock : la ville doit produire des repas.')
    return events({...state,wallet:state.wallet-price,spent:state.spent+price,meals:state.meals+1,
      city:{...state.city,food:state.city.food-1,coins:state.city.coins+price},
    },'Un repas acheté au commerce : −650 FCFA.')
  }
  if(action==='eat'){
    if(state.meals<1)return events(state,'Achète un repas au marché.')
    return events({...state,meals:state.meals-1,needs:{...state.needs,hunger:clamp(state.needs.hunger+45)}},'Tu as mangé. Faim réduite.')
  }
  if(action==='sleep'){
    if(!nearVenue(state,'house'))return events(state,'Rentre à la maison pour te reposer.')
    return events({...state,needs:{...state.needs,energy:100,hygiene:clamp(state.needs.hygiene-5)}},
      'Tu t’es reposé à la maison.')
  }
  if(action==='wash'){
    if(!nearVenue(state,'house')&&!nearVenue(state,'well'))
      return events(state,'Rends-toi chez toi ou au puits pour te laver.')
    return events({...state,needs:{...state.needs,hygiene:100}},'Hygiène restaurée.')
  }
  if(action==='socialize'){
    if(!nearVenue(state,'park')&&!nearVenue(state,'market'))
      return events(state,'Va au jardin public ou au marché pour rencontrer quelqu’un.')
    return events({...state,needs:{...state.needs,social:clamp(state.needs.social+38)}},'Tu as discuté avec des voisins.')
  }
  return state
}
export function advanceLifeHour(state:LifeState):LifeState {
  const newDay=state.hour===23
  const hour=(state.hour+1)%24
  const destination=state.route[0]
  const needs:Needs={
    hunger:clamp(state.needs.hunger-3),
    energy:clamp(state.needs.energy-(hour>=22||hour<=5?3:2)),
    hygiene:clamp(state.needs.hygiene-1),
    social:clamp(state.needs.social-1),
  }
  let next:LifeState={
    ...state,hour,day:state.day+(newDay?1:0),
    pos:destination?{...destination}:state.pos,
    route:state.route.slice(destination?1:0),trafficStep:state.trafficStep+1,
    needs,workToday:newDay?false:state.workToday,
  }
  if(newDay){
    next={...next,city:tickCity(next.city)}
    next=events(next,'Nouvelle journée : production, consommation et circulation recalculées.')
  }
  if(destination&&next.route.length===0)next=events(next,'Destination atteinte : sélectionne une interaction.')
  if(needs.hunger<15||needs.energy<12)next=events(next,'Besoins critiques : mange ou repose-toi.')
  return next
}
export function buildInLome(state:LifeState,x:number,y:number,type:BuildType):LifeState {
  if(state.inside)return events(state,'Sors du bâtiment pour construire.')
  const result=place(state.city,x,y,type)
  if(result.error)return events(state,result.error)
  // City funds, NOT personal wallet: strict separation of player's money and budget.
  return events({...state,city:result.city},'Chantier achevé : '+CATALOG[type].label+'.')
}
export function demolishInLome(state:LifeState,x:number,y:number):LifeState {
  const result=removeBuilding(state.city,x,y)
  if(result.error)return events(state,result.error)
  return events({...state,city:result.city},'Bâtiment démoli.')
}
export function simulatedTraffic(state:LifeState):RoadPoint[] {
  const roads=[...roadNetwork(state.city.buildings)].sort()
  if(roads.length===0)return []
  return [0,1,2,3].map(i=>{
    const [x,y]=roads[(state.trafficStep*(i+1)+i*3)%roads.length].split(':').map(Number)
    return {x,y}
  })
}
export function decodeLomeLife(value:unknown):LifeState|null {
  if(typeof value!=='object'||value===null)return null
  const v=value as Partial<LifeState>
  if(v.version!==1||!decodeCity(v.city)||!v.pos||!v.needs||
     !Number.isInteger(v.hour)||v.hour!<0||v.hour!>23||
     !Number.isInteger(v.day)||v.day!<1||v.day!>20000||
     !Number.isInteger(v.wallet)||v.wallet!<0||v.wallet!>100000000||
     !Number.isInteger(v.meals)||v.meals!<0||v.meals!>100000||
     !Number.isInteger(v.earned)||v.earned!<0||v.earned!>100000000||
     !Number.isInteger(v.spent)||v.spent!<0||v.spent!>100000000||
     !Number.isInteger(v.trafficStep)||v.trafficStep!<0||v.trafficStep!>100000000||
     !Object.keys(SALARIES).includes(v.job??'')||typeof v.workToday!=='boolean'||
     (v.inside!==null&&!venues.has(v.inside as Venue))||
     !Array.isArray(v.route)||v.route.length>22*22||
     !Array.isArray(v.events)||v.events.length>8||!v.events.every(e=>typeof e==='string'&&e.length<300)||
     typeof v.lastEvent!=='string'||v.lastEvent.length>300||
     !(['hunger','energy','hygiene','social'] as const).every(k=>Number.isInteger(v.needs?.[k])&&v.needs![k]>=0&&v.needs![k]<=100))return null
  const road=roadNetwork(v.city!.buildings)
  if(!road.has(id(v.pos))||!v.route.every(p=>p&&road.has(id(p))))return null
  if(v.target&&!Number.isInteger(v.target.x))return null
  return v as LifeState
}
