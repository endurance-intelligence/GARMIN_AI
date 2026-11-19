import {gpsRouteMatch} from '../_shared/garmin-route-gps.mjs'
/**
 * GARMIN_AI: private, conservative reference-route candidates.
 * Garmin FIT now stores a private distance-normalized GPS track fingerprint.
 * Legacy runs without GPS remain explicitly unverified candidates.
 * Keep raw locations/altitude profiles exclusively server-side.
 */
const numeric = v => typeof v === 'number' && Number.isFinite(v) ? v : null
const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a,b)=>a-b), h = Math.floor(s.length/2)
  return s.length%2 ? s[h] : (s[h-1]+s[h])/2
}
const round = (x,n=1) => Number(x.toFixed(n))
const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0,10) : null
const days = (a,b) => Math.abs(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000
const meters = (a,b,c,d) => {
  const rad=Math.PI/180, x=(c-a)*rad, y=(d-b)*rad
  const h=Math.sin(x/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(y/2)**2
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)))
}
const rpeScore = raw => {
  const n=numeric(raw)
  return n===null?null:n>=10&&n<=100&&n%10===0?n/10:n>=1&&n<=10?n:null
}
function endpoints(raw) {
  if(!raw||typeof raw!=='object')return null
  const a=numeric(raw.startLatitude),b=numeric(raw.startLongitude),
    c=numeric(raw.endLatitude),d=numeric(raw.endLongitude)
  if(a===null||b===null||c===null||d===null||
    Math.abs(a)>90||Math.abs(c)>90||Math.abs(b)>180||Math.abs(d)>180||
    (a===0&&b===0)||(c===0&&d===0))return null
  return {a,b,c,d}
}
export function routeMetadata(row) {
  if(!row||row.sport_type!=='running')return null
  const distance=numeric(row.distance_m),duration=numeric(row.duration_s),
    date=day(row.start_time_local),coords=endpoints(row.raw_activity)
  if(!date||!coords||distance===null||distance<3000||distance>30000||
    duration===null||duration<1200||duration>18000)return null
  const gain=numeric(row.raw_activity?.elevationGain)
  if(gain===null||gain<0||gain>2000)return null
  const moving=numeric(row.raw_activity?.movingDuration)
  const heart=numeric(row.average_heart_rate)
  return {id:String(row.activity_id),date,distance,duration,moving,
    hr:heart,rpe:rpeScore(row.rpe_raw),gain,coords}
}
export function sameEndpoints(a,b) {
  if(!a?.coords||!b?.coords)return false
  if(Math.abs(a.distance-b.distance)>Math.min(350,Math.max(120,Math.min(a.distance,b.distance)*.025)))return false
  if(meters(a.coords.a,a.coords.b,b.coords.a,b.coords.b)>90||
     meters(a.coords.c,a.coords.d,b.coords.c,b.coords.d)>90)return false
  return Math.abs(a.gain-b.gain)<=Math.max(22,Math.max(a.gain,b.gain)*.22)
}
/** Robust 17-point elevation fingerprint, centered on its initial altitude. */
export function elevationFingerprint(samples,distance) {
  if(!Array.isArray(samples)||samples.length<60||!Number.isFinite(distance)||distance<3000)return null
  const points=samples.map(s=>[numeric(s?.distance),numeric(s?.elevation)])
    .filter(p=>p[0]!==null&&p[1]!==null&&p[0]>=0&&p[0]<=distance*1.025)
    .sort((a,b)=>a[0]-b[0])
  if(points.length<60||points[0][0]>distance*.055||points[points.length-1][0]<distance*.945)return null
  const profile=[]
  for(let i=0;i<=16;i++){
    const target=distance*i/16, window=Math.max(35,distance*.026)
    const values=points.filter(p=>Math.abs(p[0]-target)<=window).map(p=>p[1])
    if(values.length<2)return null
    profile.push(median(values))
  }
  return profile.map(x=>round(x-profile[0]))
}
export function sameCourse(a,b) {
  if(!sameEndpoints(a,b)||!Array.isArray(a.profile)||!Array.isArray(b.profile)||
     a.profile.length!==17||b.profile.length!==17)return false
  const diffs=a.profile.map((x,i)=>x-b.profile[i])
  const rms=Math.sqrt(diffs.reduce((s,x)=>s+x*x,0)/diffs.length)
  return rms<=7.5&&Math.max(...diffs.map(Math.abs))<=19
}
function observedRun(meta,detail) {
  if(!detail||!['complete','partial'].includes(detail.status))return null
  const profile=elevationFingerprint(detail.samples,meta.distance)
  if(!profile)return null
  const samples=Array.isArray(detail.samples)?detail.samples:[]
  const hasHr=samples.filter(s=>numeric(s?.hr)!==null&&s.hr>=50&&s.hr<=210).length
  // The documented Garmin moving duration (rather than total elapsed time)
  // prevents long stopped periods from making an artificial slow run.
  const moving=meta.moving
  const pace=moving!==null&&moving>0&&moving<=meta.duration*1.03&&
    moving>=meta.duration*.85&&meta.distance/moving>=1.2&&meta.distance/moving<=6.5
    ?moving*1000/meta.distance:null
  return {...meta,profile,hrCoverage:samples.length?hasHr/samples.length:0,
    pace:pace!==null?round(pace):null}
}
const eligible = r => r.pace!==null&&r.rpe!==null&&r.rpe<=5&&
  r.hr!==null&&r.hr>=85&&r.hr<=175&&r.hrCoverage>=.7
function compare(group) {
  const sorted=group.filter(eligible).sort((a,b)=>a.date.localeCompare(b.date))
  if(sorted.length<2)return null
  if(sorted.length>=4){
    const older=sorted.slice(0,2),recent=sorted.slice(-2)
    const oldHr=median(older.map(x=>x.hr)),newHr=median(recent.map(x=>x.hr))
    const oldRpe=median(older.map(x=>x.rpe)),newRpe=median(recent.map(x=>x.rpe))
    if(days(older[1].date,recent[0].date)>=21&&
      Math.abs(newHr-oldHr)<=4&&Math.abs(newRpe-oldRpe)<=1){
      const before=median(older.map(x=>x.pace)),after=median(recent.map(x=>x.pace))
      return {status:'paired-medians',oldDate:older[0].date,newDate:recent[1].date,
        olderRuns:2,newerRuns:2,oldPace:round(before),newPace:round(after),
        deltaSecKm:round(after-before),olderHr:round(oldHr),newerHr:round(newHr),
        olderRpe:round(oldRpe),newerRpe:round(newRpe)}
    }
  }
  // A two-run observation is displayed explicitly as a pair, not a trend.
  for(let newest=sorted.length-1;newest>=1;newest--)
    for(let oldest=0;oldest<newest;oldest++){
      const a=sorted[oldest],b=sorted[newest]
      if(days(a.date,b.date)<21||Math.abs(a.hr-b.hr)>4||Math.abs(a.rpe-b.rpe)>1)continue
      return {status:'single-pair',oldDate:a.date,newDate:b.date,
        olderRuns:1,newerRuns:1,oldPace:a.pace,newPace:b.pace,
        deltaSecKm:round(b.pace-a.pace),olderHr:round(a.hr),newerHr:round(b.hr),
        olderRpe:a.rpe,newerRpe:b.rpe}
    }
  return null
}
/** Endpoints are only a prefilter; complete-link clustering prevents chain merges. */
export function candidateIds(rows) {
  const parsed=rows.map(routeMetadata).filter(Boolean)
  return parsed.filter((a,i)=>parsed.some((b,j)=>i!==j&&sameEndpoints(a,b)))
    .map(x=>x.id)
}
export function buildReferenceRoutes(rows,details,{maxRoutes=10,tracks=[]}={}) {
  const metadata=rows.map(routeMetadata).filter(Boolean)
  const detailMap=new Map(details.map(d=>[String(d.activity_id),d]))
  const trackMap=new Map(tracks.filter(t=>t.status==='complete'&&t.fingerprint)
    .map(t=>[String(t.activity_id),t.fingerprint]))
  const complete=metadata.map(m=>{
    const found=observedRun(m,detailMap.get(m.id))
    return found?{...found,gps:trackMap.get(m.id)||null}:null
  }).filter(Boolean)
    .sort((a,b)=>b.date.localeCompare(a.date))
  // Two passes prevent historical no-GPS runs from absorbing a verifiable
  // route into a broad candidate group. A run belongs to at most one group.
  const sameGps=(a,b)=>a.gps&&b.gps&&
    meters(a.coords.a,a.coords.b,b.coords.a,b.coords.b)<=90&&
    meters(a.coords.c,a.coords.d,b.coords.c,b.coords.d)<=90&&
    gpsRouteMatch(a.gps,b.gps).match
  const gpsGroups=[]
  for(const run of complete.filter(r=>r.gps)){
    let group=gpsGroups.find(g=>g.every(member=>sameGps(run,member)))
    if(!group){group=[];gpsGroups.push(group)}
    group.push(run)
  }
  const verifiedGroups=gpsGroups.filter(g=>g.length>=2)
  const verifiedIds=new Set(verifiedGroups.flatMap(g=>g.map(r=>r.id)))
  const candidateGroups=[]
  for(const run of complete.filter(r=>!verifiedIds.has(r.id))){
    let group=candidateGroups.find(g=>g.every(member=>
      sameCourse(run,member)&&(!run.gps||!member.gps||
        gpsRouteMatch(run.gps,member.gps).match)))
    if(!group){group=[];candidateGroups.push(group)}
    group.push(run)
  }
  const repeating=[...verifiedGroups,...candidateGroups.filter(g=>g.length>=2)]
    .sort((a,b)=>Number(verifiedGroups.includes(b))-Number(verifiedGroups.includes(a))||
      b.length-a.length||b[0].date.localeCompare(a[0].date))
  const routes=repeating.slice(0,maxRoutes).map((group,i)=>{
    const latest=group[0]
    const verified=group.every(r=>r.gps)&&group.length>=2&&
      group.every((r,i)=>group.slice(i+1).every(other=>gpsRouteMatch(r.gps,other.gps).match))
    return {id:'route-'+(i+1),title:'Referenzstrecke '+(i+1),
      gpsStatus:verified?'verified':'candidate',
      runs:group.length,distanceKm:round(median(group.map(r=>r.distance))/1000,2),
      gainM:round(median(group.map(r=>r.gain)),0),
      firstDate:group[group.length-1].date,lastDate:latest.date,
      comparison:compare(group),
      history:group.slice(0,8).map(r=>({date:r.date,
        distanceKm:round(r.distance/1000,2),paceSecKm:r.pace,
        averageHr:r.hr===null?null:round(r.hr,0),rpe:r.rpe})),
    }
  })
  return {kind:'reference-route-candidates',readOnly:true,
    coverage:{withGpsEnds:metadata.length,withElevationProfile:complete.length,
      gpsTracksAvailable:complete.filter(r=>r.gps).length,
      gpsVerifiedGroups:routes.filter(r=>r.gpsStatus==='verified').length,
      repeatedGroups:repeating.length,repeatedRuns:repeating.reduce((n,g)=>n+g.length,0)},
    routes,
    caveat:'GPS-verifizierte Strecken benutzen 51 entlang der FIT-Distanz gemessene Positionspunkte. Ohne GPS-Profil bleiben es Streckenkandidaten anhand Start/Ziel, Distanz und Höhenverlauf. Wetter, Untergrund und Ermüdung bleiben unkontrolliert.'}
}
