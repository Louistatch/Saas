'use client'

import { type City, type BuildType, SIZE, terrainAt, canBuild, type Building } from '@/lib/haroolife/townsmen-engine'
import { useEffect, useRef, useState } from 'react'

const TILE_W = 60
const TILE_H = 31
type Tool = BuildType | 'inspect' | 'demolish'
type Tile = { x: number; y: number }
type Pointer = { x: number; y: number; panX: number; panY: number; moved: boolean }

function polygon(ctx: CanvasRenderingContext2D, points: number[][], fill: string, stroke?: string) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const p of points.slice(1)) ctx.lineTo(p[0], p[1])
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke() }
}
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
  polygon(ctx, [[x, y-h/2],[x+w/2,y],[x,y+h/2],[x-w/2,y]],fill,stroke)
}
function prism(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, w: number, d: number, roof: string, wall: string) {
  const topY = y - height
  // Screen-space extrusion, intentionally stylised rather than a real building asset.
  polygon(ctx, [[x-w/2,topY],[x,topY+d/2],[x,y+d/2],[x-w/2,y]], '#9b7958')
  polygon(ctx, [[x,topY+d/2],[x+w/2,topY],[x+w/2,y],[x,y+d/2]], wall)
  diamond(ctx,x,topY,w,d,roof,'#354231')
}
function drawTree(ctx: CanvasRenderingContext2D,x:number,y:number,scale:number) {
  ctx.fillStyle='#73513b';ctx.fillRect(x-2*scale,y-16*scale,4*scale,16*scale)
  for(const [ox,oy,r,color] of [[0,-24,12,'#236944'],[-7,-19,9,'#35804b'],[7,-21,9,'#48a25b']] as const) {
    ctx.beginPath();ctx.arc(x+ox*scale,y+oy*scale,r*scale,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()
  }
}
function drawBuilding(ctx:CanvasRenderingContext2D,b:Building,x:number,y:number,scale:number) {
  if(b.type==='road') {
    diamond(ctx,x,y,TILE_W*scale*.92,TILE_H*scale*.92,'#9a9588')
    ctx.strokeStyle='#ece2b4';ctx.lineWidth=1.6*scale;ctx.beginPath()
    ctx.moveTo(x-8*scale,y);ctx.lineTo(x+8*scale,y);ctx.stroke();return
  }
  const roofs: Record<string,[string,string,number]> = {
    hall:['#b24c2d','#ead1a0',38],house:['#b85837','#efd4a3',24],
    lumberyard:['#8c6440','#d5b98d',20],farm:['#569244','#95794f',7],
    mill:['#b5ada3','#e3d2b8',32],bakery:['#ba7643','#f2cfa7',23],
    market:['#e8a932','#e1d0a6',17],well:['#528fb7','#d6c4ac',13],park:['#2d8745','#68a355',4],
  }
  const [roof,wall,rawHeight]=roofs[b.type]
  const h=rawHeight*scale
  ctx.save()
  if(b.type==='farm') {
    diamond(ctx,x,y-2*scale,TILE_W*scale*.82,TILE_H*scale*.8,'#8e693e')
    for(let i=-2;i<=2;i++){
      const offset=i*5*scale
      ctx.strokeStyle=i%2?'#e9c85a':'#70b649';ctx.lineWidth=3.2*scale
      ctx.beginPath();ctx.moveTo(x-16*scale,y+offset*.45);ctx.lineTo(x+16*scale,y+offset*.45);ctx.stroke()
    }
  } else if(b.type==='park'){
    diamond(ctx,x,y-3*scale,TILE_W*scale*.81,TILE_H*scale*.81,'#7fb65c')
    drawTree(ctx,x,y,scale*.75)
  } else if(b.type==='well'){
    prism(ctx,x,y,h,TILE_W*scale*.38,TILE_H*scale*.45,roof,wall)
    ctx.beginPath();ctx.ellipse(x,y-h,7*scale,3*scale,0,0,Math.PI*2);ctx.fillStyle='#216f98';ctx.fill()
  } else {
    prism(ctx,x,y,h,TILE_W*scale*.72,TILE_H*scale*.75,roof,wall)
    if(b.type==='house'||b.type==='hall'||b.type==='bakery'){
      polygon(ctx,[[x+2*scale,y-10*scale],[x+8*scale,y-13*scale],[x+8*scale,y-4*scale],[x+2*scale,y-1*scale]],'#715143')
      if(b.type==='hall'){
        ctx.fillStyle='#f5d477';ctx.fillRect(x-1*scale,y-h-14*scale,3*scale,14*scale)
      }
    }
    if(b.type==='mill') {
      ctx.strokeStyle='#eee7d5';ctx.lineWidth=3*scale
      ctx.beginPath();ctx.moveTo(x-15*scale,y-h-4*scale);ctx.lineTo(x+15*scale,y-h+10*scale)
      ctx.moveTo(x+15*scale,y-h-6*scale);ctx.lineTo(x-15*scale,y-h+12*scale);ctx.stroke()
    }
    if(b.type==='lumberyard') {
      for(let j=0;j<3;j++){
        ctx.fillStyle='#9e6939';ctx.fillRect(x-19*scale+j*4*scale,y-5*scale-j*3*scale,19*scale,4*scale)
      }
    }
    if(b.type==='market'){
      for(let j=0;j<4;j++){
        ctx.fillStyle=j%2===0?'#e3b44b':'#e9e5cf'
        ctx.fillRect(x-17*scale+j*9*scale,y-h-4*scale,9*scale,5*scale)
      }
    }
  }
  ctx.restore()
}

export function CityIsometricCanvas({
 city,tool,onTile,inspect,
}:{
 city: City;tool:Tool;onTile:(x:number,y:number)=>void;inspect:Tile|null
}) {
 const canvas=useRef<HTMLCanvasElement>(null)
 const pointer=useRef<Pointer|null>(null)
 const [pan,setPan]=useState({x:0,y:0})
 const [zoom,setZoom]=useState(1)
 const [hover,setHover]=useState<Tile|null>(null)
 const [frame,setFrame]=useState(0)
 const panRef=useRef(pan)
 panRef.current=pan
 const zoomRef=useRef(zoom)
 zoomRef.current=zoom

 useEffect(()=>{
   const media=window.matchMedia('(prefers-reduced-motion: reduce)')
   if(media.matches)return
   const id=window.setInterval(()=>{if(document.visibilityState==='visible')setFrame(t=>(t+1)%1000)},250)
   return()=>window.clearInterval(id)
 },[])

 function cellAt(clientX:number,clientY:number):Tile|null{
   const node=canvas.current
   if(!node)return null
   const rect=node.getBoundingClientRect()
   const px=clientX-rect.left,py=clientY-rect.top
   const z=zoomRef.current,p=panRef.current
   const rx=(px-rect.width/2-p.x)/z
   const ry=(py-rect.height*.50-p.y)/z+(SIZE-1)*TILE_H/2
   const x=Math.round(rx/TILE_W+ry/TILE_H)
   const y=Math.round(ry/TILE_H-rx/TILE_W)
   return x>=0&&x<SIZE&&y>=0&&y<SIZE?{x,y}:null
 }
 useEffect(()=>{
   const el=canvas.current;if(!el)return
   const render=()=>{
     const ctx=el.getContext('2d');if(!ctx)return
     const rect=el.getBoundingClientRect()
     if(rect.width<1||rect.height<1)return
     const dpr=Math.min(2,window.devicePixelRatio||1)
     const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr)
     if(el.width!==width||el.height!==height){el.width=width;el.height=height}
     ctx.setTransform(dpr,0,0,dpr,0,0)
     const w=rect.width,h=rect.height
     const sky=ctx.createLinearGradient(0,0,0,h)
     sky.addColorStop(0,'#b7d9d5');sky.addColorStop(.48,'#d4e3b6');sky.addColorStop(1,'#7eaf78')
     ctx.fillStyle=sky;ctx.fillRect(0,0,w,h)
     const z=zoom,px=pan.x,py=pan.y
     const location=(x:number,y:number):[number,number]=>
       [w/2+px+(x-y)*TILE_W/2*z,
       h*.50+py+((x+y)-(SIZE-1))*TILE_H/2*z]
     const occupied=new Map(city.buildings.map(b=>[b.x+':'+b.y,b]))
     const tiles:Array<[number,number]>=[]
     for(let x=0;x<SIZE;x++)for(let y=0;y<SIZE;y++)tiles.push([x,y])
     tiles.sort((a,b)=>(a[0]+a[1])-(b[0]+b[1])||a[0]-b[0])
     for(const [x,y] of tiles){
       const [cx,cy]=location(x,y),ter=terrainAt(x,y)
       const b=occupied.get(x+':'+y)
       const grass=(x+y)%3===0?'#80b563':(x+y)%3===1?'#87bc68':'#7bb261'
       const shade=ter==='water'?'#55a9bc':ter==='forest'?'#5a9752':grass
       diamond(ctx,cx,cy,TILE_W*z+1,TILE_H*z+1,shade,'#6a9e5b')
       if(b)drawBuilding(ctx,b,cx,cy,z)
       else if(ter==='forest'&&((x+y)%2===0||x%3===0))drawTree(ctx,cx,cy,z*.76)
       else if(ter==='water'){
         ctx.strokeStyle='#b9e8df';ctx.lineWidth=z
         ctx.beginPath();ctx.moveTo(cx-9*z,cy);ctx.lineTo(cx+4*z,cy-3*z);ctx.stroke()
       }
       const focus=hover?.x===x&&hover.y===y||inspect?.x===x&&inspect.y===y
       if(focus){
         const illegal=tool!=='inspect'&&tool!=='demolish'&&canBuild(city,x,y,tool)!==null
         const color=tool==='inspect'?'#fef08a':illegal?'#ef4444':'#a7f3d0'
         ctx.lineWidth=3*z;ctx.strokeStyle=color
         ctx.beginPath();ctx.moveTo(cx,cy-TILE_H*z/2);ctx.lineTo(cx+TILE_W*z/2,cy)
         ctx.lineTo(cx,cy+TILE_H*z/2);ctx.lineTo(cx-TILE_W*z/2,cy);ctx.closePath();ctx.stroke()
       }
     }
     // Decorative citizens walk on roads; simulation workers are calculated independently.
     const roads=city.buildings.filter(b=>b.type==='road')
     const visible=Math.min(14,Math.max(2,Math.floor(city.population/2)))
     for(let i=0;i<visible&&roads.length;i++){
       const segment=roads[(i*7+Math.floor(frame/26))%roads.length]
       const [sx,sy]=location(segment.x,segment.y)
       const t=(frame%26)/26
       const ox=((i%2===0?t:1-t)-.5)*15*z
       ctx.beginPath();ctx.ellipse(sx+ox,sy-1*z,2.6*z,1.3*z,0,0,2*Math.PI);ctx.fillStyle='#294232';ctx.fill()
       ctx.beginPath();ctx.arc(sx+ox,sy-7*z,3.4*z,0,2*Math.PI);ctx.fillStyle=i%3===0?'#ca7b4c':'#dfb28d';ctx.fill()
       ctx.fillStyle=i%3===1?'#e7d168':'#386fa1';ctx.fillRect(sx+ox-2.4*z,sy-5*z,5*z,5*z)
     }
     ctx.fillStyle='rgba(11,46,34,.83)';ctx.fillRect(10,10,220,32)
     ctx.font='600 12px system-ui';ctx.fillStyle='#f0fff2'
     ctx.fillText('HAROOVILLE  •  JOUR '+city.day,21,31)
   }
   render()
   const ro=new ResizeObserver(render);ro.observe(el)
   return()=>ro.disconnect()
 },[city,pan,zoom,hover,inspect,tool,frame])

 function onPointerDown(e:React.PointerEvent<HTMLCanvasElement>){
   e.currentTarget.setPointerCapture(e.pointerId)
   pointer.current={x:e.clientX,y:e.clientY,panX:panRef.current.x,panY:panRef.current.y,moved:false}
 }
 function onPointerMove(e:React.PointerEvent<HTMLCanvasElement>){
   const initial=pointer.current
   if(initial){
     const dx=e.clientX-initial.x,dy=e.clientY-initial.y
     if(Math.hypot(dx,dy)>7)initial.moved=true
     if(initial.moved)setPan({x:initial.panX+dx,y:initial.panY+dy})
   }else{
     const cell=cellAt(e.clientX,e.clientY)
     setHover(old=>old?.x===cell?.x&&old?.y===cell?.y?old:cell)
   }
 }
 function onPointerUp(e:React.PointerEvent<HTMLCanvasElement>){
   const first=pointer.current
   pointer.current=null
   if(first&&!first.moved){
     const cell=cellAt(e.clientX,e.clientY)
     if(cell)onTile(cell.x,cell.y)
   }
 }
 return (
   <div className="relative h-full w-full overflow-hidden bg-[#88b77f]">
     <canvas
       ref={canvas}
       aria-label="Terrain isométrique. Choisissez un bâtiment, puis touchez une case. Glissez pour déplacer la carte."
       role="img"
       className="block h-full w-full cursor-crosshair touch-none select-none"
       onPointerDown={onPointerDown} onPointerMove={onPointerMove}
       onPointerUp={onPointerUp} onPointerCancel={()=>{pointer.current=null}}
       onPointerLeave={()=>setHover(null)}
     />
     <div className="absolute right-3 top-3 flex flex-col gap-2">
       <button type="button" aria-label="Agrandir la ville" onClick={()=>setZoom(v=>Math.min(2.1,Math.round((v+.2)*10)/10))} className="rounded-lg bg-white/95 px-3 py-2 font-bold shadow">+</button>
       <button type="button" aria-label="Réduire la ville" onClick={()=>setZoom(v=>Math.max(.65,Math.round((v-.2)*10)/10))} className="rounded-lg bg-white/95 px-3 py-2 font-bold shadow">−</button>
       <button type="button" aria-label="Centrer la carte" onClick={()=>{setZoom(1);setPan({x:0,y:0})}} className="rounded-lg bg-white/95 px-2 py-2 text-xs font-bold shadow">Centrer</button>
     </div>
     <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-emerald-950/85 px-3 py-1.5 text-xs text-white">
       Glisser : déplacer • Toucher : {tool==='inspect'?'inspecter':tool==='demolish'?'démolir':'construire'}
     </div>
   </div>
 )
}
