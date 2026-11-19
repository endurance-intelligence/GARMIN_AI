import {useEffect,useMemo,useState} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {analyzeCoachLongTerm,longTermWeekStarts} from '../lib/coachLongTerm.mjs'
import type {CoachLongTerm} from '../lib/coachLongTerm.mjs'
import '../styles/coach-long-term.css'

type WeekBoard={start:string;activities:Record<string,unknown>[];manual:Record<string,unknown>[]}
const dateLabel=(s:string)=>s.slice(8,10)+'.'+s.slice(5,7)+'.'
const fmt=(value:number|null)=>value===null?'–':value.toLocaleString('de-DE',{maximumFractionDigits:1})
const isWeekBoard=(b:unknown,expected:string):b is WeekBoard=>{
 if(!b||typeof b!=='object')return false
 const row=b as Record<string,unknown>
 return row.start===expected&&Array.isArray(row.activities)&&Array.isArray(row.manual)
}
/** The daily Coach already has four historic weeks. Load only older weeks on demand. */
export function CoachLongTermCard({today,snapshot,active}:{
 today:string;snapshot:CoachSnapshot;active:boolean
}){
 const [expanded,setExpanded]=useState(false)
 const [range,setRange]=useState<8|12>(8)
 const [fetched,setFetched]=useState<Record<string,WeekBoard>>({})
 const [attempted,setAttempted]=useState<string[]>([])
 const [failed,setFailed]=useState<string[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 useEffect(()=>{
  // New authenticated snapshot, or a newly selected athlete, invalidates old board cache.
  setFetched({});setAttempted([]);setFailed([]);setError('');setLoading(false)
 },[snapshot,today])
 useEffect(()=>{
  if(!active||!expanded||!garminSupabase)return
  const known=new Set([...snapshot.boards,...Object.values(fetched)]
   .map(x=>String(x?.start||'')))
  const wanted=longTermWeekStarts(today,range).filter(x=>
   !known.has(x)&&!attempted.includes(x))
  if(!wanted.length)return
  const controller=new AbortController()
  let mounted=true
  setLoading(true);setError('')
  void (async()=>{
   const {data:{session},error:authError}=await garminSupabase.auth.getSession()
   if(!session||authError)throw Error('Für die historische Garmin-Analyse bitte anmelden.')
   // At most eight older weeks, only when expanded (no slow start for Coach/Race Prep).
   const results=await Promise.allSettled(wanted.map(async week=>{
    const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-week-board?start='+
     encodeURIComponent(week),{
      cache:'no-store',signal:controller.signal,
      headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
    })
    if(!response.ok)throw Error('Historische Garmin-Woche '+dateLabel(week)+' nicht erreichbar ('+
     response.status+').')
    const payload:unknown=await response.json()
    if(!isWeekBoard(payload,week))throw Error('Unvollständige Garmin-Woche '+dateLabel(week)+'.')
    return payload
   }))
   if(!mounted)return
   const received:Record<string,WeekBoard>={}
   const bad:string[]=[]
   for(let i=0;i<results.length;i++){
    const result=results[i]
    if(result.status==='fulfilled')received[wanted[i]]=result.value
    else bad.push(wanted[i])
   }
   setFetched(prev=>({...prev,...received}))
   setAttempted(prev=>[...new Set([...prev,...wanted])])
   setFailed(prev=>[...new Set([...prev,...bad])].filter(x=>!received[x]))
   if(bad.length)setError(bad.length+' Garmin-Wochen nicht abrufbar. Fehlende Wochen werden nicht als null Kilometer gewertet.')
  })().catch(e=>{
   if(!mounted||controller.signal.aborted)return
   setError(e instanceof Error?e.message:'Historische Garmin-Daten konnten nicht geladen werden.')
   setAttempted(prev=>[...new Set([...prev,...wanted])])
   setFailed(prev=>[...new Set([...prev,...wanted])])
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,expanded,today,range,snapshot,attempted,fetched])
 const boards=useMemo(()=>{
  const byStart=new Map<string,Record<string,unknown>>()
  for(const b of Object.values(fetched))byStart.set(b.start,b)
  // The current authenticated Coach snapshot is the most recent source for its weeks.
  for(const b of snapshot.boards)if(typeof b.start==='string')byStart.set(b.start,b)
  return [...byStart.values()]
 },[snapshot,fetched])
 const goal=snapshot.goal?.goal as {race_date?:string}|undefined
 const model=useMemo(()=>analyzeCoachLongTerm({
  today,boards,plans:snapshot.plans,life:snapshot.life,weeks:range,
  raceDate:goal?.race_date||null
 }),[today,boards,snapshot.plans,snapshot.life,range,goal?.race_date])
 const maxKm=Math.max(1,...model.weeks.map(w=>w.distanceKm??0))
 const rangeStart=longTermWeekStarts(today,range)
 const isMissing=rangeStart.some(start=>!boards.some(b=>b.start===start))
 const retry=()=>{
  setError('');setAttempted(prev=>prev.filter(x=>!failed.includes(x)));setFailed([])
 }
 return <details className="clt-root" open={expanded}
  onToggle={event=>setExpanded(event.currentTarget.open)}
  aria-label="Langfristige Garmin-Trainingsanalyse 8 und 12 Wochen">
  <summary className="clt-heading">
   <span className="clt-glyph" aria-hidden="true">▥</span>
   <span>
    <small>COACH · LANGFRISTIGE TRAININGSANALYSE</small>
    <strong>Dein Lauftraining über 8 und 12 Wochen</strong>
    <span>Nur echte Garmin-Daten · bei Bedarf laden · keine automatische Planänderung</span>
   </span>
   <span className="clt-chevron" aria-hidden="true">⌄</span>
  </summary>
  <div className="clt-body">
   <p>Hier siehst du, wie sich dein gemessener Laufumfang, die längsten Läufe und
    deine Garmin-Anstrengungsbewertungen entwickelt haben.
    Frühere Wochen laden wir erst, wenn du diese Ansicht öffnest.</p>
   <div className="clt-controls" role="group" aria-label="Zeitraum wählen">
    <button type="button" aria-pressed={range===8} onClick={()=>setRange(8)}
     className={range===8?'selected':''}>8 Wochen</button>
    <button type="button" aria-pressed={range===12} onClick={()=>setRange(12)}
     className={range===12?'selected':''}>12 Wochen</button>
    {loading&&<span role="status">Garmin-Historie wird geladen …</span>}
   </div>
   {error&&<div className="clt-caution" role="alert">{error}
    {failed.length>0&&<button type="button" onClick={retry}>Fehlende Wochen erneut laden</button>}
   </div>}
   {isMissing&&!loading&&<p className="clt-caution" role="status">
    Noch nicht alle {range} Wochen verfügbar; fehlende Werte bleiben unbekannt.</p>}
   <div className="clt-counters">
    <div><small>GELADENE WOCHEN</small><strong>{model.completeWeeks} / {range}</strong></div>
    <div><small>LETZTE 4 WOCHEN · MEDIAN</small><strong>{fmt(model.currentMedianKm)} km</strong></div>
    <div><small>VERÄNDERUNG ZUR VORPERIODE</small><strong>{
     model.changePct===null?'Nicht belastbar':
     (model.changePct>0?'+':'')+model.changePct+' %'
    }</strong></div>
   </div>
   <div className="clt-chart" role="list" aria-label="Gemessene Laufkilometer nach ISO-Woche">
    {[...model.weeks].reverse().map(w=><div className="clt-week" role="listitem" key={w.start}>
     <span>{dateLabel(w.start)}</span>
     <div className="clt-track">
      {w.available&&w.distanceKm!==null?<span className="clt-fill"
       style={{width:(w.distanceKm/maxKm*100)+'%'}}/>:
       <span className="clt-unknown">Daten fehlen</span>}
     </div>
     <strong>{!w.available?'–':w.distanceKm===null?'km ?':fmt(w.distanceKm)+' km'}</strong>
    </div>)}
   </div>
   <div className="clt-blocks">
    {model.blocks.map((block,i)=><div key={i}>
     <small>{block.label}</small>
     <strong>{block.medianKm===null?'Nicht auswertbar':fmt(block.medianKm)+' km Median'}</strong>
     <span>{block.measured} von 4 Wochen mit gemessener Distanz</span>
    </div>)}
   </div>
   <div className="clt-feedback">
    <strong>Garmin-RPE: subjektive Anstrengung</strong>
    <p>Nur selbst bewertete Läufe: <strong>{model.rpe.count}</strong>.
     {' '}Niedrig (1–4/10): <strong>{model.rpe.low}</strong> ·
     Mittel (5–7/10): <strong>{model.rpe.moderate}</strong> ·
     Hoch (8–10/10): <strong>{model.rpe.high}</strong>.
     {' '}{model.rpe.missing} Läufe ohne auswertbares RPE.
    </p>
    <p>In {model.longRunsMeasured} geladenen Wochen ist ein Garmin-Lauf von
     mindestens 60 Minuten aufgezeichnet. Das ist keine Aussage über die Intensitätszone.</p>
   </div>
   <div className={'clt-recommendation'+(model.flags.length?' is-caution':'')}>
    <strong>{model.title}</strong>
    <p>{model.advice}</p>
    {model.flags.length>0&&<p>{model.flags.join(' · ')}</p>}
   </div>
   <p className="clt-disclaimer">
    <strong>Polarisiertes Training:</strong> Garmin-RPE ist nicht dasselbe wie Zeit unter LT1
    oder über LT2. Ohne validierte individuelle HF-/Leistungszonen und geeignete
    Zeit-in-Zone-Daten wird hier bewusst keine 80/20-Quote berechnet.
    Ungeladene oder unvollständige Wochen zählen nicht als Trainingspausen.
    Werte sind Einordnung, keine Freigabe für zusätzliche Einheiten.
    Vorschläge im 7-Tage-Coach bleiben gesondert freigabepflichtig.
   </p>
  </div>
 </details>
}
