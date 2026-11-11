/** GPX geometry and directional wind exposure. No fake tree/shade assessments. */
const rad=(d)=>d*Math.PI/180
export function haversine(a,b){
 const da=rad(b[0]-a[0]),db=rad(b[1]-a[1])
 const x=Math.sin(da/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(db/2)**2
 return 12742000*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)))
}
export function bearing(a,b){
 const phi1=rad(a[0]),phi2=rad(b[0]),lambda=rad(b[1]-a[1])
 const x=Math.sin(lambda)*Math.cos(phi2)
 const y=Math.cos(phi1)*Math.sin(phi2)-Math.sin(phi1)*Math.cos(phi2)*Math.cos(lambda)
 return (Math.atan2(x,y)*180/Math.PI+360)%360
}
export function parseGpxTrack(xml){
 if(typeof xml!=='string'||xml.length>4*1024*1024||!/<(?:[a-z]+:)?gpx\b/i.test(xml))
  throw Error('Bitte eine GPX-Datei bis 4 MB auswählen.')
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Ungültiges GPX-Format.')
 const points=[]
 const re=/<(?:[a-z]+:)?(?:trkpt|rtept)\b([^>]{0,500})>([\s\S]*?)<\/(?:[a-z]+:)?(?:trkpt|rtept)>/gi
 for(const m of xml.matchAll(re)){
  const a=/\blat=["']([^"']+)["']/i.exec(m[1])
  const b=/\blon=["']([^"']+)["']/i.exec(m[1])
  if(!a||!b)continue
  const lat=Number(a[1]),lon=Number(b[1])
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
   throw Error('Ungültige GPX-Koordinate.')
  const ele=/<(?:[a-z]+:)?ele>([^<]{1,30})<\/(?:[a-z]+:)?ele>/i.exec(m[2])
  const alt=ele?Number(ele[1]):null
  points.push(Number.isFinite(alt)&&alt>=-500&&alt<=9000?[lat,lon,alt]:[lat,lon])
  if(points.length>30000)throw Error('Zu viele GPS-Punkte.')
 }
 if(points.length<3)throw Error('Keine vollständige GPX-Strecke gefunden.')
 let distance=0,up=0,down=0
 for(let i=1;i<points.length;i++){
  const d=haversine(points[i-1],points[i]);distance+=d
  if(points[i].length===3&&points[i-1].length===3){
   const diff=points[i][2]-points[i-1][2]
   if(diff>0)up+=diff;else down-=diff
  }
 }
 const maximum=1200,step=Math.max(1,Math.ceil((points.length-1)/(maximum-1)))
 const simplified=points.filter((_,i)=>i%step===0)
 if(simplified[simplified.length-1]!==points[points.length-1])
  simplified.push(points[points.length-1])
 return {points:simplified,originalPoints:points.length,
  distanceM:distance,ascentM:up,descentM:down}
}
export function routeSvg(points,width=600,height=280){
 if(!Array.isArray(points)||points.length<2)return null
 const meanLat=points.reduce((a,b)=>a+b[0],0)/points.length
 const cos=Math.max(.1,Math.cos(rad(meanLat)))
 const xs=points.map(x=>x[1]*cos),ys=points.map(x=>-x[0])
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
 const margin=24,usableW=width-2*margin,usableH=height-2*margin
 const scale=Math.min(usableW/Math.max(0.00001,maxX-minX),usableH/Math.max(0.00001,maxY-minY))
 const sx=(x)=>width/2+(x-(minX+maxX)/2)*scale
 const sy=(y)=>height/2+(y-(minY+maxY)/2)*scale
 const positions=points.map((_,i)=>[sx(xs[i]),sy(ys[i])])
 const polyline=positions.map(x=>x.map(v=>v.toFixed(1)).join(',')).join(' ')
 const cumulative=[0]
 for(let i=1;i<points.length;i++)
  cumulative.push(cumulative[i-1]+haversine(points[i-1],points[i]))
 return {positions,polyline,cumulative,totalM:cumulative[cumulative.length-1]}
}
export function windSegments(points,windFromDeg,windKmh,minimumKmh=10){
 if(!Number.isFinite(windFromDeg)||!Number.isFinite(windKmh)||windKmh<minimumKmh||
  !Array.isArray(points)||points.length<3)return []
 let km=0;const sections=[]
 for(let i=1;i<points.length;i++){
  const length=haversine(points[i-1],points[i]);const heading=bearing(points[i-1],points[i])
  const component=windKmh*Math.cos(rad(heading-windFromDeg))
  if(length>0)sections.push({startM:km,endM:km+length,headwindKmh:component,heading})
  km+=length
 }
 const buckets=[]
 const size=1000
 for(let from=0;from<km;from+=size){
  let weighted=0,meters=0
  for(const section of sections){
   const overlap=Math.max(0,Math.min(section.endM,from+size)-Math.max(section.startM,from))
   if(overlap){weighted+=section.headwindKmh*overlap;meters+=overlap}
  }
  if(meters){const component=weighted/meters
   if(component>=Math.max(8,windKmh*.4))
    buckets.push({fromKm:Math.round(from/1000*10)/10,
     toKm:Math.round(Math.min(from+1000,km)/1000*10)/10,
     headwindKmh:Math.round(component)})
  }
 }
 return buckets.sort((a,b)=>b.headwindKmh-a.headwindKmh).slice(0,3)
}
