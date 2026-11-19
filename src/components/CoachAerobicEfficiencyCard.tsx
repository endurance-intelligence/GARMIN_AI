import {useEffect,useMemo,useState} from 'react'
import {garminPublishableKey,garminSupabase,garminSupabaseUrl} from '../lib/garminSupabase'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import {longTermWeekStarts} from '../lib/coachLongTerm.mjs'
import {phaseForRace} from '../lib/coachGoal'
import {analyzeAerobicEfficiency} from '../lib/coachAerobicEfficiency.mjs'
import '../styles/coach-aerobic-efficiency.css'

type AerobicBin={bpmFrom:number;bpmTo:number;seconds:number;speedMps:number}
type AerobicRun={date:string;distanceBand:string;gainMPerKm:number;
 rpe:number;validSeconds:number;coveragePercent:number;speedCv:number;bins:AerobicBin[]}
type AerobicWeek={start:string;end:string;readOnly:true;kind:string;
 totalRunning:number;eligible:number;excluded:number;
 reasons:Record<string,number>;runs:AerobicRun[]}
const plausible=(x:unknown,start:string):x is AerobicWeek=>{
 if(!x||typeof x!=='object')return false
 const o=x as Record<string,unknown>
 return o.start===start&&o.readOnly===true&&o.kind==='observed-pace-at-HR'&&
  typeof o.totalRunning==='number'&&Number.isInteger(o.totalRunning)&&
  typeof o.eligible==='number'&&Number.isInteger(o.eligible)&&
  typeof o.excluded==='number'&&Number.isInteger(o.excluded)&&
  o.eligible+o.excluded===o.totalRunning&&Array.isArray(o.runs)&&
  o.runs.length===o.eligible
}
const pace=(seconds:number|null)=>{
 if(seconds===null)return '–'
 const s=Math.round(seconds)
 return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+' min/km'
}
const seconds=(v:number|null)=>{
 if(v===null)return '–'
 const s=Math.round(Math.abs(v))
 return (v<0?'−':v>0?'+':'')+
  Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+' min/km'
}
const fmt=(v:number|null,suffix='')=>v===null?'–':
 v.toLocaleString('de-DE',{maximumFractionDigits:1})+suffix
const caveat='Wetter, Wind, Untergrund, Herzfrequenzmessung, Ermüdung und Tagesform sind nicht kontrolliert. Gleiche HF bedeutet nicht automatisch gleiche physiologische Belastung.'

export function CoachAerobicEfficiencyCard({today,weeks,active,goal}:{
 today:string;weeks:8|12;active:boolean;
 goal?:{race_date?:string;race_name?:string}|null
}){
 const [opened,setOpened]=useState(false)
 const [fetched,setFetched]=useState<Record<string,AerobicWeek>>({})
 const [attempted,setAttempted]=useState<string[]>([])
 const [failed,setFailed]=useState<string[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const starts=useMemo(()=>longTermWeekStarts(today,weeks),[today,weeks])
 const {data:hrProfile,loading:hrLoading,error:hrError}=useGarminHrProfile(active&&opened)
 useEffect(()=>{setFetched({});setAttempted([]);setFailed([]);setError('')},[today])
 useEffect(()=>{
  if(!active||!opened||!garminSupabase)return
  const missing=starts.filter(s=>!fetched[s]&&!attempted.includes(s))
  if(!missing.length)return
  const controller=new AbortController()
  let mounted=true
  setLoading(true);setError('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst unter Einstellungen anmelden.')
   const good:Record<string,AerobicWeek>={}
   const bad:string[]=[]
   for(let i=0;i<missing.length;i+=2){
    const batch=missing.slice(i,i+2)
    const settled=await Promise.allSettled(batch.map(async start=>{
     const response=await fetch(garminSupabaseUrl+
      '/functions/v1/read-garmin-easy-efficiency?start='+encodeURIComponent(start),{
      cache:'no-store',signal:controller.signal,
      headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
     })
     if(!response.ok)throw Error('Garmin-Laufanalyse nicht erreichbar.')
     const result:unknown=await response.json()
     if(!plausible(result,start))throw Error('Ungültige Garmin-Laufzusammenfassung.')
     return result
    }))
    for(let j=0;j<settled.length;j++){
     const r=settled[j]
     if(r.status==='fulfilled')good[batch[j]]=r.value
     else bad.push(batch[j])
    }
    if(controller.signal.aborted)return
   }
   if(!mounted)return
   setFetched(p=>({...p,...good}))
   setAttempted(p=>[...new Set([...p,...missing])])
   setFailed(p=>[...new Set([...p,...bad])].filter(x=>!good[x]))
   if(bad.length)setError(bad.length+
    ' Garmin-Wochen nicht abrufbar. Fehlende Wochen werden niemals geschätzt.')
  })().catch(e=>{
   if(!mounted||controller.signal.aborted)return
   setError(e instanceof Error?e.message:'Garmin-Laufvergleich vorübergehend nicht verfügbar.')
   setAttempted(p=>[...new Set([...p,...missing])])
   setFailed(p=>[...new Set([...p,...missing])])
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,opened,today,starts,fetched,attempted])
 const available=starts.map(s=>fetched[s]).filter((x):x is AerobicWeek=>Boolean(x))
 const phase=useMemo(()=>{
  if(!goal?.race_date)return null
  try{return phaseForRace(goal.race_date,today).phase}catch{return null}
 },[goal?.race_date,today])
 const model=analyzeAerobicEfficiency({today,weeks,weekRows:available,
  profile:hrProfile?.profile||null,
  goal:goal?.race_name?{race_name:goal.race_name,phase:phase||undefined}:null
 })
 const unavailable=starts.filter(s=>!fetched[s]).length
 const total=available.reduce((n,w)=>n+w.totalRunning,0)
 const eligible=available.reduce((n,w)=>n+w.eligible,0)
 const retry=()=>{setError('');setAttempted(p=>p.filter(x=>!failed.includes(x)));setFailed([])}
 const protectedRace=phase!==null&&['peak','taper','race','recovery'].includes(phase)
 return <details className="cae-root" open={opened} onToggle={e=>setOpened(e.currentTarget.open)}
  aria-label="Aerobe Tempo-Herzfrequenz-Entwicklung aus echten Garmin FIT-Messwerten">
  <summary className="cae-header">
   <span className="cae-symbol" aria-hidden="true">↗</span>
   <span className="cae-heading">
    <small>COACH · AEROBES TEMPO / HERZFREQUENZ</small>
    <strong>Wirst du bei gleichem Puls schneller?</strong>
    <span>Nur vergleichbare, lockere Garmin-Läufe · keine Laufökonomie-Diagnose</span>
   </span><span aria-hidden="true">⌄</span>
  </summary>
  <div className="cae-body">
   <p>Wir vergleichen gemessene FIT-Geschwindigkeit bei derselben
    5-bpm-Herzfrequenzspanne. Berücksichtigt werden nur von dir als locker
    bewertete Outdoor-Läufe (Garmin-RPE bis 5/10) mit geringer Steigung,
    gleichmäßiger Geschwindigkeit und ausreichender Datenqualität.
    Laufband, Trails, harte Intervalle und fehlende Aufzeichnungen werden nicht
    als vergleichbar behandelt.</p>
   {(loading||hrLoading)&&<p className="cae-note" role="status">Garmin-FIT-Läufe und persönliche Herzfrequenzzonen werden geprüft …</p>}
   {error&&<p className="cae-warning" role="alert">{error}
    {failed.length>0&&<button type="button" onClick={retry}>Fehlende Wochen erneut laden</button>}</p>}
   {hrError&&<p className="cae-warning">{hrError}</p>}
   {unavailable>0&&!loading&&<p className="cae-warning">
    {unavailable} abgeschlossene Wochen noch nicht geladen. Aus fehlenden
    Daten wird keine Leistungsverbesserung abgeleitet.</p>}
   <div className="cae-counters">
    <div><small>ABGERUFENE WOCHEN</small><strong>{model.weeksLoaded} / {weeks}</strong></div>
    <div><small>UNTERSUCHTE LÄUFE</small><strong>{total}</strong></div>
    <div><small>LOCKER &amp; GUT MESSBAR</small><strong>{eligible}</strong></div>
   </div>
   {model.comparable?<div className="cae-result">
    <div className="cae-reference">
     <strong>Vergleich bei {model.hrBand?.[0]}–{model.hrBand?.[1]} bpm</strong>
     <span>{model.distanceBand} · ähnliche Höhenmeter · Garmin-RPE vergleichbar</span>
    </div>
    <div className="cae-paces">
     <div><small>VORHERIGE 4 WOCHEN</small><strong>{pace(model.earlierPaceSecKm)}</strong>
      <span>{model.previousRuns} Läufe</span></div>
     <div><small>LETZTE 4 WOCHEN</small><strong>{pace(model.recentPaceSecKm)}</strong>
      <span>{model.recentRuns} Läufe</span></div>
    </div>
    <div className="cae-change"><strong>{
     model.deltaSecKm!==null&&model.deltaSecKm<0?'Beobachtet: zuletzt schneller':
     model.deltaSecKm!==null&&model.deltaSecKm>0?'Beobachtet: zuletzt langsamer':
     'Beobachtet: gleiches Tempo'}</strong>
     <span>{seconds(model.deltaSecKm)} ·
      Änderung der Geschwindigkeit {model.speedChangePercent!==null&&
       model.speedChangePercent>0?'+':''}{fmt(model.speedChangePercent,' %')}</span>
    </div>
    <p className="cae-small">Mittlere aufgezeichnete Steigung:
     {' '}{fmt(model.previousGain,' hm/km')} → {fmt(model.recentGain,' hm/km')}.
     Garmin-RPE: {fmt(model.earlierRpe,'/10')} → {fmt(model.recentRpe,'/10')}.
     Das sind unabhängige Vergleichsläufe; kein nachgewiesener Fitnesszuwachs.</p>
   </div>:<div className="cae-insufficient">
    <strong>{model.title}</strong>
    <p>{model.note}</p>
   </div>}
   {protectedRace&&<p className="cae-protect">
    Wettkampf- oder Regenerationsphase: Keine Trainingssteigerung aufgrund
    dieses Vergleichs. Der bestehende Coach und deine Freigaben haben Vorrang.
   </p>}
   <p className="cae-disclaimer"><strong>Was diese Analyse nicht misst:</strong> Eine
    laborbasierte Laufökonomie (Sauerstoffbedarf), VO₂max oder einen kausal
    gesicherten Fitnessfortschritt. {caveat} Die Garmin-Gerätezonen werden zur
    Auswahl eines niedrigen HF-Bereichs verwendet und können sich über die
    Vergangenheit geändert haben. Kein automatisches Workout und kein
    Rückschluss aus nicht vorhandenen Daten.</p>
  </div>
 </details>
}
