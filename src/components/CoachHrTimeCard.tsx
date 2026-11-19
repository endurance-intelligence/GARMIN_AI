import {useEffect,useMemo,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import {phaseForRace} from '../lib/coachGoal'
import {analyzeGarminIntensityTrend} from '../lib/coachIntensityTrend.mjs'
import {CoachIntensityTrendPanel} from './CoachIntensityTrendPanel'
import {longTermWeekStarts} from '../lib/coachLongTerm.mjs'
import {classifyGarminHrSeconds} from '../lib/coachHrTime.mjs'
import type {GarminHrSecondsWeek} from '../lib/coachHrTime.mjs'
import '../styles/coach-hr-time.css'

const zoneRange=(lower:number|null,upper:number|null)=>
 lower===null?'≤ '+upper+' bpm':upper===null?'≥ '+lower+' bpm':
 lower+'–'+upper+' bpm'
const duration=(sec:number)=>{
 const min=Math.round(sec/60)
 return min>=60?Math.floor(min/60)+' h '+String(min%60).padStart(2,'0')+' min':
  min+' min'
}
const validWeek=(x:unknown,start:string):x is GarminHrSecondsWeek=>{
 if(!x||typeof x!=='object')return false
 const row=x as Record<string,unknown>
 return row.start===start&&row.readOnly===true&&
  typeof row.histogram==='object'&&row.histogram!==null&&
  typeof row.measuredActivities==='number'&&Number.isInteger(row.measuredActivities)&&
  typeof row.totalActivities==='number'&&Number.isInteger(row.totalActivities)&&
  typeof row.validSeconds==='number'&&Number.isInteger(row.validSeconds)
}
export function CoachHrTimeCard({today,weeks,active,goal}:{
 today:string;weeks:8|12;active:boolean;
 goal?:{race_date?:string;race_name?:string}|null
}){
 const [expanded,setExpanded]=useState(false)
 const [fetched,setFetched]=useState<Record<string,GarminHrSecondsWeek>>({})
 const [attempted,setAttempted]=useState<string[]>([])
 const [failed,setFailed]=useState<string[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const {data:profileData,loading:profileLoading,error:profileError}=useGarminHrProfile(active&&expanded)
 useEffect(()=>{
  setFetched({});setAttempted([]);setFailed([]);setError('')
 },[today])
 const starts=useMemo(()=>longTermWeekStarts(today,weeks),[today,weeks])
 useEffect(()=>{
  if(!active||!expanded||!garminSupabase)return
  const missing=starts.filter(s=>!fetched[s]&&!attempted.includes(s))
  if(!missing.length)return
  const controller=new AbortController()
  let mounted=true
  setLoading(true);setError('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden.')
   const successful:Record<string,GarminHrSecondsWeek>={}
   const unavailable:string[]=[]
   // FIT chunks may be large: only two owner-authenticated week calls at once.
   for(let i=0;i<missing.length;i+=2){
    const batch=missing.slice(i,i+2)
    const requests=await Promise.allSettled(batch.map(async week=>{
     const response=await fetch(garminSupabaseUrl+'/functions/v1/read-garmin-hr-time?start='+
      encodeURIComponent(week),{
      cache:'no-store',signal:controller.signal,
      headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
     })
     if(!response.ok)throw Error('Historische FIT-Daten vorübergehend nicht verfügbar.')
     const result:unknown=await response.json()
     if(!validWeek(result,week))throw Error('Unvollständige FIT-Zeitbilanz.')
     return result
    }))
    for(let j=0;j<requests.length;j++){
     if(requests[j].status==='fulfilled')
      successful[batch[j]]=(requests[j] as PromiseFulfilledResult<GarminHrSecondsWeek>).value
     else unavailable.push(batch[j])
    }
    if(controller.signal.aborted)return
   }
   if(!mounted)return
   setFetched(prev=>({...prev,...successful}))
   setAttempted(prev=>[...new Set([...prev,...missing])])
   setFailed(prev=>[...new Set([...prev,...unavailable])].filter(s=>!successful[s]))
   if(unavailable.length)setError(unavailable.length+
    ' Wochen konnten nicht zuverlässig ausgewertet werden. Fehlende Zeiten bleiben unbekannt.')
  })().catch(e=>{
   if(!mounted||controller.signal.aborted)return
   setError(e instanceof Error?e.message:'Historische FIT-Daten nicht verfügbar.')
   setAttempted(prev=>[...new Set([...prev,...missing])])
   setFailed(prev=>[...new Set([...prev,...missing])])
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[today,weeks,starts,expanded,active,fetched,attempted])
 const results=starts.map(s=>fetched[s]).filter((x):x is GarminHrSecondsWeek=>Boolean(x))
 const model=useMemo(()=>classifyGarminHrSeconds(results,profileData?.profile||null),
  [results,profileData])
 const goalContext=useMemo(()=>{
  if(!goal?.race_date||!goal?.race_name)return null
  try{
   const status=phaseForRace(goal.race_date,today)
   return {race_name:goal.race_name,race_date:goal.race_date,phase:status.phase}
  }catch{return null}
 },[goal?.race_date,goal?.race_name,today])
 const intensityTrend=analyzeGarminIntensityTrend({
  today,weeks,weekRows:results,profile:profileData?.profile||null,
  goal:goalContext
 })
 const nMissing=starts.filter(s=>!fetched[s]).length
 const retry=()=>{setError('');setAttempted(prev=>prev.filter(s=>!failed.includes(s)));setFailed([])}
 return <details className="cht-root" open={expanded}
  onToggle={e=>setExpanded(e.currentTarget.open)}
  aria-label="Zeit in tatsächlichen Garmin Herzfrequenzzonen aus FIT Aufzeichnung">
  <summary className="cht-summary">
   <span className="cht-symbol">♥</span>
   <span className="cht-title"><small>ECHTE FIT-ZEITMESSUNG · GEMESSENE SEKUNDEN</small>
    <strong>Wie lange warst du in deinen Garmin-HF-Zonen?</strong>
    <span>Aufgezeichnete FIT-Sekunden statt Durchschnittspuls oder RPE</span>
   </span><span aria-hidden="true">⌄</span>
  </summary>
  <div className="cht-body">
   <p>Die App liest deine echten FIT-Zeitstempel und ordnet gültige Herzfrequenzsekunden
    den derzeit gespeicherten persönlichen Garmin-Laufzonen zu.
    Aufzeichnungslücken, fehlende HF und nicht importierte Läufe werden nicht geschätzt.</p>
   {(loading||profileLoading)&&<p role="status" className="cht-muted">
    Zeitgestempelte FIT-Daten und persönliche Garmin-Zonen werden geladen …</p>}
   {error&&<p className="cht-warning" role="alert">{error}
    {failed.length>0&&<button type="button" onClick={retry}>Fehlende Wochen erneut prüfen</button>}</p>}
   {profileError&&<p className="cht-warning">{profileError}</p>}
   {model.status==='no-zones'?<p className="cht-warning">
    Garmin hat keine eindeutig auswertbaren fünf Laufzonen geliefert.
    Die realen FIT-Sekunden bleiben erhalten; es wird keine Zone erfunden.</p>:
   model.status==='insufficient'?<p className="cht-muted">
    Für eine Zonenverteilung sind noch zu wenige ausreichend aufgezeichnete
    Garmin-Läufe vorhanden. FIT-Daten können noch importiert werden.</p>:
    <div className="cht-bands">
     {model.zones.map((z,i)=><div className="cht-band" key={z.label}>
      <span className="cht-zone-name">{z.label}<small>{zoneRange(z.lower,z.upper)}</small></span>
      <div className="cht-track"><span className={'cht-fill z'+i}
       style={{width:z.share+'%'}}/></div>
      <strong>{z.share.toLocaleString('de-DE',{maximumFractionDigits:1})} %</strong>
      <small>{duration(z.seconds)}</small>
     </div>)}
    </div>}
   <div className="cht-metrics">
    <div><small>GEMESSENE HF-ZEIT</small><strong>{duration(model.measuredSeconds)}</strong></div>
    <div><small>LAUFEINHEITEN MIT AUSREICHENDEN DATEN</small><strong>{
     model.measuredActivities} / {model.activities}</strong></div>
    <div><small>AUSGEWERTETE WOCHEN</small><strong>{model.validWeeks} / {weeks}</strong></div>
    <div><small>HF-ABDECKUNG DER AUSGEWERTETEN LÄUFE</small><strong>{
     model.coveredPercent===null?'–':
     model.coveredPercent.toLocaleString('de-DE',{maximumFractionDigits:1})+' %'
    }</strong></div>
   </div>
   <CoachIntensityTrendPanel data={intensityTrend}/>
   {model.status==='measured'&&<p className="cht-summary-stat">
    Unterhalb beziehungsweise innerhalb der Garmin-Zone 2:
    {' '}<strong>{model.belowOrInZ2Share?.toLocaleString('de-DE')} %</strong>
    {' '}der tatsächlich gemessenen HF-Zeit. Keine physiologische 80/20-Quote.</p>}
   {nMissing>0&&!loading&&<p className="cht-warning">
    {nMissing} Wochen sind noch nicht ausgewertet. Fehlende Daten verändern die Aussagekraft.</p>}
   {model.skippedActivities>0&&<p className="cht-warning">
    {model.skippedActivities} Garmin-Läufe konnten mangels vollständiger
    FIT-/HF-Abdeckung nicht in die Zonenanteile einfließen.</p>}
   <p className="cht-note"><strong>Referenz: aktuell gespeicherte Garmin-Laufzonen.</strong>
    Für ältere Einheiten können andere Zonengrenzen gegolten haben;
    die historische Darstellung nutzt deshalb die heutigen Grenzen rückwirkend.
    Garmin-Zone 2 entspricht nicht automatisch LT1/VT1 und Garmin-Zone 5
    nicht automatisch LT2. Eine belastbare polarisierte Intensitätsverteilung
    erfordert individuell bestimmte physiologische Schwellen.
    Keine Trainingsanpassung oder Garmin-Änderung.</p>
  </div>
 </details>
}
