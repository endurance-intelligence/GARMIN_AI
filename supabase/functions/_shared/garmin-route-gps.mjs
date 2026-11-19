/**
 * Private GARMIN_AI FIT GPS evidence v1.0.8.
 * A 51-point distance-normalized track, never full per-second positions.
 * Raw geographic positions never enter the public app or FIT record chunks.
 */
const finite=x=>typeof x==='number'&&Number.isFinite(x)
const asDegrees=x=>{
 if(!finite(x))return null
 const d=Math.abs(x)>180?x*180/2147483648:x
 return Math.abs(d)<=180?d:null
}
export function fitPosition(record){
 const lat=asDegrees(record?.positionLat),lon=asDegrees(record?.positionLong)
 if(lat===null||lon===null||Math.abs(lat)>90||
    (lat===0&&lon===0))return null
 return [lat,lon]
}
const radians=Math.PI/180
export function gpsMeters(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2)return Infinity
 const dLat=(b[0]-a[0])*radians,dLon=(b[1]-a[1])*radians
 const z=Math.sin(dLat/2)**2+
   Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dLon/2)**2
 return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.max(0,z))))
}
/** Require data at >=90% of distance milestones; avoid bridging large GPS outages.
 * FIT GPS positions can be in semicircles or degrees depending on decoder.
 */
export function gpsRouteFingerprint(rawRecords){
 if(!Array.isArray(rawRecords)||rawRecords.length<90)return null
 const valid=[]
 for(const r of rawRecords){
  const pos=fitPosition(r),distance=r?.distance
  if(!pos||!finite(distance)||distance<0||distance>1e6)continue
  if(valid.length&&distance<=valid[valid.length-1].d)continue
  valid.push({d:distance,p:pos})
 }
 if(valid.length<90)return null
 const length=valid[valid.length-1].d
 if(length<3000||length>30000||valid[0].d>length*.035)return null
 const n=51, points=[],maxError=Math.min(85,Math.max(32,length*.0075))
 let index=0,missed=0
 for(let i=0;i<n;i++){
  const target=length*i/(n-1)
  while(index+1<valid.length&&valid[index+1].d<=target)index++
  const a=valid[index],b=valid[Math.min(index+1,valid.length-1)]
  const nearest=Math.abs(a.d-target)<=Math.abs(b.d-target)?a:b
  if(Math.abs(nearest.d-target)>maxError){
   points.push(null);missed++;continue
  }
  points.push(nearest.p.map(x=>Math.round(x*1e6)/1e6))
 }
 // No partial tracks: the positions must cover the full route, not just a GPS island.
 if(missed>5||points[0]===null||points[n-1]===null)return null
 return {version:1,points,validPoints:n-missed,lengthM:Math.round(length)}
}
export function gpsRouteMatch(a,b){
 if(!a||!b||a.version!==1||b.version!==1||
  !Array.isArray(a.points)||!Array.isArray(b.points)||
  a.points.length!==51||b.points.length!==51||!
  finite(a.lengthM)||!finite(b.lengthM))return {match:false,reason:'missing'}
 const lengthDiff=Math.abs(a.lengthM-b.lengthM)
 if(lengthDiff>Math.min(350,Math.max(120,Math.min(a.lengthM,b.lengthM)*.025)))
  return {match:false,reason:'distance'}
 const distances=[]
 for(let i=0;i<51;i++){
  const p=a.points[i],q=b.points[i]
  if(p===null||q===null)continue
  if(!Array.isArray(p)||!Array.isArray(q)||p.length!==2||q.length!==2||
      p.some(x=>!finite(x))||q.some(x=>!finite(x)))return {match:false,reason:'invalid'}
  distances.push(gpsMeters(p,q))
 }
 if(distances.length<44)return {match:false,reason:'coverage'}
 const sorted=[...distances].sort((x,y)=>x-y)
 const median=sorted[Math.floor(sorted.length/2)]
 const p90=sorted[Math.floor((sorted.length-1)*.9)]
 const within=distances.filter(x=>x<=75).length/distances.length
 const matched=median<=35&&p90<=90&&within>=.82
 return {match:matched,reason:matched?'gps':'geometry',medianM:Math.round(median),
   p90M:Math.round(p90),within75Pct:Math.round(within*100)}
}
