'use client'

import {
  BUILDING_TYPES, CATALOG, capacity, count, decodeCity, goal, initialCity,
  isConnected, place, removeBuilding, tick, workforce,
  type BuildType, type City,
} from '@/lib/haroolife/townsmen-engine'
import { CityIsometricCanvas } from './city-isometric-canvas'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Coins, Hammer, Heart, Home, Pause, Play, RotateCcw,
  Trees, Utensils, Users, Warehouse, X,
} from 'lucide-react'

const STORAGE = 'haroolife.citybuilder.v1'
type Tool = BuildType | 'inspect' | 'demolish'
type Cell = { x: number; y: number }
const categories: { title: string; types: BuildType[] }[] = [
  { title: 'Urbanisme', types: ['road','house','well','park'] },
  { title: 'Production', types: ['lumberyard','farm','mill','bakery','market'] },
]
const fmt = (value:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(value)
function summary(city:City){
  return [
    {label:'Trésorerie',value:fmt(city.coins)+' FCFA',icon:Coins},
    {label:'Bois',value:fmt(city.wood),icon:Trees},
    {label:'Maïs',value:fmt(city.maize),icon:Warehouse},
    {label:'Farine',value:fmt(city.flour),icon:Warehouse},
    {label:'Nourriture',value:fmt(city.food),icon:Utensils},
    {label:'Habitants',value:fmt(city.population)+' / '+capacity(city),icon:Users},
    {label:'Bonheur',value:fmt(city.happiness)+' %',icon:Heart},
  ]
}
export function CityBuilder(){
  const [city,setCity]=useState<City>(initialCity)
  const [loaded,setLoaded]=useState(false)
  const [tool,setTool]=useState<Tool>('road')
  const [speed,setSpeed]=useState<0|1|3>(0)
  const [selection,setSelection]=useState<Cell|null>(null)
  const [message,setMessage]=useState('Choisis une construction puis touche une case près des routes.')
  const [tutorial,setTutorial]=useState(true)
  const achievement=useMemo(()=>goal(city),[city])
  const workers=useMemo(()=>workforce(city),[city])
  const selected=selection?city.buildings.find(b=>b.x===selection.x&&b.y===selection.y):null

  useEffect(()=>{
    try {
      const saved=localStorage.getItem(STORAGE)
      if(saved){
        const parsed=decodeCity(JSON.parse(saved))
        if(parsed){setCity(parsed);setMessage('Ville restaurée sur cet appareil.')}
      }
    }catch{/* blocked storage or corrupted save: safe fresh city */}
    setLoaded(true)
  },[])
  useEffect(()=>{
    if(!loaded)return
    try{localStorage.setItem(STORAGE,JSON.stringify(city))}catch{/* storage is optional */}
  },[city,loaded])
  useEffect(()=>{
    if(!speed||!loaded)return
    const id=window.setInterval(()=>setCity(current=>tick(current)),speed===1?1700:560)
    return()=>window.clearInterval(id)
  },[speed,loaded])

  function onTile(x:number,y:number){
    setSelection({x,y})
    if(tool==='inspect'){
      const building=city.buildings.find(b=>b.x===x&&b.y===y)
      setMessage(building?(building.type==='hall'?'Mairie':CATALOG[building.type].label)+' — '+(isConnected(building,city)?'relié aux routes':'isolé'):'Terrain libre : choisis un bâtiment.')
      return
    }
    if(tool==='demolish'){
      const result=removeBuilding(city,x,y)
      setCity(result.city)
      setMessage(result.error??'Bâtiment démoli.')
      return
    }
    const result=place(city,x,y,tool)
    setCity(result.city)
    setMessage(result.error??CATALOG[tool].label+' construit !')
  }
  function restart(){
    if(!window.confirm('Recommencer la ville ? Votre sauvegarde locale sera remplacée.'))return
    setSpeed(0);setCity(initialCity());setSelection(null);setTool('road')
    setMessage('Une nouvelle ville a été créée.')
  }
  return(
    <main className="min-h-screen bg-[#eef1e4] pb-16 text-[#1a3029]">
      <header className="border-b border-[#b3c9ac] bg-[#113b2c] text-white">
        <div className="mx-auto flex max-w-[1580px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <Link href="/haroolife" className="text-xs font-medium text-emerald-200 hover:underline">FaîtiereHub / HarooLife</Link>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">HAROOVILLE <span className="text-emerald-300">— Kpalimé</span></h1>
            <p className="text-xs text-emerald-100">Construisez une ville togolaise • Stratégie isométrique</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/haroolife/territoire/carte" className="rounded-lg border border-white/40 px-3 py-2 text-xs font-semibold hover:bg-white/10">Carte du Togo</Link>
            <button type="button" onClick={()=>setTutorial(v=>!v)} className="rounded-lg border border-white/40 p-2" aria-label="Afficher ou masquer l'aide"><BookOpen className="h-5 w-5" /></button>
            <button type="button" onClick={restart} className="rounded-lg border border-white/40 p-2" aria-label="Recommencer"><RotateCcw className="h-5 w-5"/></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1580px] space-y-4 px-3 py-4 sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {summary(city).map(({label,value,icon:Icon})=>(
            <div key={label} className="flex items-center gap-2 rounded-xl border border-emerald-900/10 bg-white px-3 py-3 shadow-sm">
              <Icon className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true"/>
              <div className="min-w-0"><p className="text-[11px] text-slate-500">{label}</p><p className="truncate text-sm font-extrabold tabular-nums sm:text-base">{value}</p></div>
            </div>
          ))}
        </div>

        {tutorial&&(
          <section className="relative rounded-xl border border-amber-300 bg-[#fff9e8] px-4 py-3 text-sm shadow-sm" aria-label="Tutoriel de construction">
            <button type="button" onClick={()=>setTutorial(false)} className="absolute right-3 top-3" aria-label="Fermer le tutoriel"><X className="h-4 w-4"/></button>
            <p className="pr-8 font-bold">Objectif : du petit village à une ville prospère</p>
            <p className="mt-1">Construis des <strong>routes</strong> et connecte un <strong>champ de maïs → moulin → boulangerie</strong>. Ajoute des maisons, un puits et un marché ; embauche suffisamment d'habitants pour faire fonctionner la ville. Les bâtiments non reliés aux routes ne produisent rien.</p>
          </section>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-3">
            <section className="overflow-hidden rounded-2xl border-4 border-[#bbd1b2] bg-white shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-[#f9f5e7] px-3 py-2">
                <div className="flex items-center gap-2">
                  <Home aria-hidden="true" className="h-4 w-4 text-emerald-800"/>
                  <span className="font-bold">Votre village</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold">Jour {city.day}</span>
                </div>
                <div className="flex items-center gap-1" aria-label="Vitesse de simulation">
                  {([
                    {value:0 as const,label:'Pause',icon:Pause},
                    {value:1 as const,label:'1×',icon:Play},
                    {value:3 as const,label:'3×',icon:Play},
                  ]).map(({value,label,icon:Icon})=>(
                    <button key={value} type="button" title={label} aria-pressed={speed===value} onClick={()=>setSpeed(value)}
                      className={speed===value?'rounded-md bg-emerald-800 px-3 py-2 text-xs font-bold text-white':'rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-bold hover:bg-emerald-50'}>
                      {label==='Pause'?<Icon className="inline h-4 w-4"/>:label}
                    </button>
                  ))}
                  <button type="button" onClick={()=>setCity(c=>tick(c))} className="rounded-md bg-amber-300 px-3 py-2 text-xs font-bold" title="Avancer un jour">+ 1 jour</button>
                </div>
              </div>
              <div className="h-[55vh] min-h-[380px] max-h-[730px] w-full sm:h-[67vh]">
                <CityIsometricCanvas city={city} tool={tool} onTile={onTile} inspect={selection}/>
              </div>
              <p role="status" aria-live="polite" className="min-h-10 border-t border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-950">{message}</p>
            </section>

            <section className="rounded-2xl border border-[#c5d8b9] bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-extrabold"><Hammer className="h-5 w-5"/> Construire</h2>
                <div className="flex gap-2">
                  <button type="button" onClick={()=>setTool('inspect')} aria-pressed={tool==='inspect'} className={tool==='inspect'?'rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white':'rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold'}>Inspecter</button>
                  <button type="button" onClick={()=>setTool('demolish')} aria-pressed={tool==='demolish'} className={tool==='demolish'?'rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white':'rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold'}>Démolir</button>
                </div>
              </div>
              {categories.map(category=>(
                <div key={category.title} className="mb-4 last:mb-0">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{category.title}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {category.types.map(type=>{
                      const item=CATALOG[type]
                      const active=tool===type
                      return(
                        <button key={type} type="button" onClick={()=>{setTool(type);setMessage(item.description)}} aria-pressed={active}
                          className={active?'min-h-24 rounded-xl border-2 border-emerald-700 bg-emerald-100 p-3 text-left shadow-sm':'min-h-24 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-500 hover:bg-emerald-50'}>
                          <span className="text-xl" aria-hidden="true">{item.icon}</span>
                          <span className="mt-1 block text-xs font-bold">{item.label}</span>
                          <span className="block text-[11px] text-slate-600">{fmt(item.coins)} FCFA · {item.wood} bois</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          </div>

          <aside className="space-y-3">
            <section className="rounded-2xl border border-[#c5d8b9] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-black">Mission : développer la ville</h2>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600" style={{width:achievement.done/achievement.total*100+'%'}}/></div>
              <p className="mt-1 text-xs font-semibold text-emerald-800">{achievement.done} / {achievement.total} objectifs atteints</p>
              <ul className="mt-3 space-y-2 text-sm">{achievement.steps.map(step=><li key={step}>{step}</li>)}</ul>
            </section>
            <section className="rounded-2xl border border-[#c5d8b9] bg-white p-4 shadow-sm">
              <h2 className="font-extrabold">Gestion des habitants</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-emerald-50 p-2">Population<strong className="mt-1 block text-xl">{city.population}</strong></div>
                <div className="rounded-lg bg-emerald-50 p-2">Emplois nécessaires<strong className="mt-1 block text-xl">{workers.required}</strong></div>
              </div>
              <p className="mt-2 text-xs text-slate-600">Habitations connectées : {count(city,'house')} · Capacité : {capacity(city)}. Production et bonheur dépendent de tes décisions.</p>
              {workers.required>workers.available&&<p className="mt-2 rounded-lg bg-amber-100 p-2 text-xs font-semibold text-amber-900">Main-d'œuvre insuffisante : construis des logements et assure l'approvisionnement.</p>}
            </section>
            {selected&&(
              <section className="rounded-2xl border border-[#c5d8b9] bg-white p-4 shadow-sm">
                <h2 className="font-extrabold">Bâtiment sélectionné</h2>
                <p className="mt-2 text-lg font-bold">{selected.type==='hall'?'Mairie':CATALOG[selected.type].label}</p>
                <p className="text-xs text-slate-500">Case {selected.x+1}, {selected.y+1} · {isConnected(selected,city)?'Connecté au réseau routier':'Non connecté'}</p>
                <p className="mt-2 text-sm">{selected.type==='hall'?'Centre historique de votre ville.':CATALOG[selected.type].description}</p>
              </section>
            )}
            <section className="rounded-2xl border border-[#c5d8b9] bg-white p-4 shadow-sm">
              <h2 className="font-extrabold">Journal de la ville</h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-600">{city.log.map((entry,i)=><li key={i} className="border-l-2 border-emerald-300 pl-3">{entry}</li>)}</ul>
            </section>
            <p className="px-2 text-xs text-slate-500">Le jeu est fictif et distinct des comptes réels. Sauvegarde automatique uniquement dans ce navigateur, sur cet appareil.</p>
          </aside>
        </div>
      </div>
    </main>
  )
}
