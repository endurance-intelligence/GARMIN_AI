import {useEffect,useMemo,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import type {SessionSample} from '../lib/sessionAnalysis'
import {heartZoneDistribution,zoneIndexForHr,splitBarHeight,paceLabel,compactHr,zoneColors} from '../lib/trainingVisuals.mjs'
import {displayPaceZoneLimits} from './IntervalsCoachContext'
import '../styles/session-visual-insights.css'

type Segment={repeat?:number;km?:number;distanceM:number;durationS?:number|null;paceSeconds:number;avgHr:number|null}
type Review={activityId:string;name:string;type:string;intervals?:Segment[];kilometers?:Segment[]}
type CoachResponse={reviews:Review[]}
type Zones={hrZones:number[];paceZones:number[];lthr:number|null;thresholdPace:number|null;hrNames:string[]}
type LoadComparison={available:boolean;reason?:string;load?:number;median?:number;ratio?:number;
 category?:'higher'|'lower'|'usual';count?:number;weekCount?:number;windowDays?:number}
type CoachFinding={label:string;category:'higher'|'lower'|'usual';text:string;daysToRace?:number|null}
type Extra={connected:boolean;zones:Zones|null;activity:{load:number|null;hrZoneSeconds:number[]}|null;
 loadContext?:{activity:LoadComparison|null;activityFinding:CoachFinding|null;historyAvailable:boolean}}
const decimal=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const pct=(n:number)=>n.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})
const zoneRange=(b:{low:number|null;high:number|null})=>b.low===null?'≤ '+b.high+' bpm':b.high===null?'> '+(b.low-1)+' bpm':b.low+'–'+b.high+' bpm'
const loadLabel={higher:'Über deinem Lauf-Median',usual:'Im üblichen Bereich',lower:'Unter deinem Lauf-Median'} as const
async function readPrivate(path:string,token:string,signal:AbortSignal){
 const r=await fetch(garminSupabaseUrl+'/functions/v1/'+path,{
  method:'GET',cache:'no-store',signal,
  headers:{authorization:'Bearer '+token,apikey:garminPublishableKey}
 })
 if(!r.ok)throw Error('HTTP '+r.status)
 return r.json()
}

/** Private, on-demand visual deep dive. It supplements but never changes the Coach verdict. */
export function SessionVisualInsights({active,activityId,samples}:{
 active:boolean;activityId:string;samples:SessionSample[]
}){
 const [review,setReview]=useState<Review|null>(null)
 const [extra,setExtra]=useState<Extra|null>(null)
 const [loading,setLoading]=useState(false)
 const [availability,setAvailability]=useState({coach:false,intervals:false})
 useEffect(()=>{
  if(!active||!garminSupabase||!activityId)return
  const controller=new AbortController()
  let mounted=true
  setReview(null);setExtra(null);setAvailability({coach:false,intervals:false});setLoading(true)
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)return
   const id=encodeURIComponent(activityId)
   const results=await Promise.allSettled([
    readPrivate('garmin-coach-review?id='+id,session.access_token,controller.signal),
    readPrivate('garmin-intervals-insights?id='+id,session.access_token,controller.signal)
   ])
   if(!mounted)return
   const a=results[0].status==='fulfilled'?results[0].value as CoachResponse:null
   const b=results[1].status==='fulfilled'?results[1].value as Extra:null
   setReview(a?.reviews?.find(r=>r.activityId===activityId)||null)
   setExtra(b)
   setAvailability({coach:!!a,intervals:!!b})
  })().catch(()=>{}).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,activityId])
 const zones=extra?.zones
 const hrBands=useMemo(()=>heartZoneDistribution(samples,zones?.hrZones),[samples,zones?.hrZones])
 const paceBands=zones?displayPaceZoneLimits(zones.paceZones,zones.thresholdPace):[]
 const splits=review?.type==='intervals'?review?.intervals||[]:review?.kilometers||[]
 const isIntervals=review?.type==='intervals'
 const hasOpenPaceZone=zones?.paceZones?.some(x=>x>=250)||false
 const trainingLoad=typeof extra?.activity?.load==='number'&&Number.isFinite(extra.activity.load)&&extra.activity.load>=0?
  extra.activity.load:null
 const comparison=extra?.loadContext?.activity
 const finding=extra?.loadContext?.activityFinding
 const personalLoad=comparison?.available===true&&typeof comparison.median==='number'&&
  typeof comparison.ratio==='number'&&comparison.category?comparison:null
 const currentShare=personalLoad&&trainingLoad!==null&&personalLoad.median!==undefined?
  Math.min(98,Math.max(4,100*trainingLoad/(Math.max(trainingLoad,personalLoad.median)*1.2))):null
 const medianShare=personalLoad&&trainingLoad!==null&&personalLoad.median!==undefined?
  Math.min(98,Math.max(4,100*personalLoad.median/(Math.max(trainingLoad,personalLoad.median)*1.2))):null
 if(!active)return null
 return <section className="sv-wrap" aria-label="Visuelle Garmin- und Intervals.icu-Trainingsanalyse">
  <div className="sv-top">
   <div><span className="sv-eyebrow">COACH VISUALS / GARMIN × INTERVALS.ICU</span>
    <h3>So sah dein Training wirklich aus.</h3>
    <p>Gemessene Belastung, deine Zonen und die einzelnen Abschnitte – ohne erfundene Zielwerte.</p>
   </div>
   {trainingLoad!==null?<div className="sv-load-kpi" role="group" aria-label="Intervals.icu Trainingsbelastung">
    <span>TRAININGSBELASTUNG</span>
    <div><strong>{decimal(trainingLoad)}</strong><small>Punkte · Intervals Load</small></div>
    <p>Schätzung aus Dauer und Intensität – kein Prozentwert und keine Trainingsnote.</p>
    {personalLoad&&<span className={'sv-load-flag sv-load-flag-'+personalLoad.category}>
     {loadLabel[personalLoad.category!]}</span>}
   </div>:<span className="sv-source-dot" aria-hidden="true"/>}
  </div>
  {loading&&<p className="sv-state" role="status">Lade deine persönlichen Trainingsgrafiken …</p>}
  {trainingLoad!==null&&personalLoad&&currentShare!==null&&medianShare!==null&&
   <div className="sv-load-comparison" aria-label="Persönlicher Trainingsbelastungsvergleich">
    <div className="sv-load-comparison-title"><strong>Wie anstrengend war der Lauf für dich?</strong>
     <span>Vergleich: deine letzten 8 Wochen</span></div>
    <div className="sv-load-comparison-scale" role="img"
     aria-label={'Dein Lauf: '+decimal(trainingLoad)+' Belastungspunkte. Median der vorherigen Läufe: '+decimal(personalLoad.median!)+' Punkte.'}>
      <div className="sv-load-comparison-fill" style={{width:currentShare+'%'}}/>
      <div className="sv-load-median-pin" style={{left:medianShare+'%'}}/>
    </div>
    <div className="sv-load-comparison-legend"><span><i className="sv-my-load"/>Dieser Lauf <b>{decimal(trainingLoad)}</b></span>
     <span><i className="sv-median-load"/>Dein bisheriger Median <b>{decimal(personalLoad.median!)}</b></span>
     <span>{personalLoad.count} Läufe als Vergleich</span></div>
    {finding?.text&&<p className="sv-load-coach"><strong>Coach:</strong> {finding.text}</p>}
    <p className="sv-load-fineprint">Vergleich aller erfassten Laufeinheiten – auch unterschiedlicher Länge.
     Der Belastungswert beschreibt Trainingsstress, nicht die Qualität der Intervalle.</p>
   </div>}
  {trainingLoad!==null&&!personalLoad&&!loading&&extra?.loadContext&&
   <p className="sv-load-no-baseline">
    <strong>Persönlicher Vergleich noch nicht zuverlässig möglich.</strong>
    {extra.loadContext.historyAvailable?
     ' Es liegen zu wenige Intervals.icu-Läufe aus mindestens drei Wochen vor.':
     ' Intervals.icu liefert derzeit keine vollständige Aktivitätshistorie.'}
    {' '}Die {decimal(trainingLoad)} Punkte bleiben messbar, werden aber nicht als hoch oder niedrig eingestuft.
   </p>}
  {!loading&&!availability.coach&&!availability.intervals&&
   <p className="sv-state">Detailgrafiken sind momentan nicht abrufbar. Das Coach-Fazit oben bleibt davon unabhängig.</p>}
  {splits.length>0&&<article className="sv-panel">
   <div className="sv-heading">
    <div><span className="sv-eyebrow">GARMIN FIT / ABSCHNITTE</span>
     <h4>{isIntervals?'Deine Wiederholungen':'Dein Kilometerverlauf'}</h4></div>
    <div className="sv-heading-count">{splits.length} {isIntervals?'Belastungen':'Kilometerabschnitte'}</div>
   </div>
   <div className="sv-splits" role="list" aria-label={isIntervals?'Intervallzeiten und Durchschnittspuls':'Kilometer-Pace und Durchschnittspuls'}>
    {splits.map((s,i)=><div className="sv-split" role="listitem" key={i}>
      <div className="sv-split-top"><span>{isIntervals?'WDH '+(i+1):'KM '+(i+1)}</span><span>{Math.round(s.distanceM)} m</span></div>
      <div className="sv-split-bar-well" aria-hidden="true">
       <div className="sv-split-bar" style={{height:splitBarHeight(splits,i)+'%',
        background:i===splits.length-1?'linear-gradient(0deg,#4bbac9,#8ce0ff)':'linear-gradient(0deg,#495dca,#a69cff)'}}/>
      </div>
      <strong className="sv-split-pace">{paceLabel(s.paceSeconds)}</strong>
      <small>min/km</small>
      <span className="sv-split-hr">♥ {compactHr(s.avgHr)}</span>
      {zoneIndexForHr(s.avgHr,zones?.hrZones)!==null&&
       <small className="sv-split-zone">Ø-HF in Z{zoneIndexForHr(s.avgHr,zones?.hrZones)}</small>}
     </div>)}
   </div>
   <p className="sv-explainer">{isIntervals?
    'Nur FIT-Belastungsabschnitte – ohne Warm-up, Erholung und Cool-down. Balkenhöhe = relative Geschwindigkeit. Ø-HF-Zone = Bereich des Durchschnittspulses, nicht Zeitanteil und keine Trainingsnote.':
    'Garmin-Kilometerabschnitte. Unterschiede können durch Gelände und Tempoveränderungen entstehen. Balken stellen nur die relative Geschwindigkeit dar.'}
   </p>
  </article>}
  {!!zones&&<div className="sv-chart-grid">
   <article className="sv-panel">
    <div className="sv-heading"><div><span className="sv-eyebrow">GARMIN-HF × INTERVALS.ICU</span>
      <h4>Deine Pulszonen</h4></div><span className="sv-side-label">Gemessene HF</span></div>
    {hrBands?<div className="sv-hr-bands" role="img" aria-label="Anteil der Garmin-HF-Messpunkte in den persönlichen Intervals.icu-Zonen">
      {hrBands.bands.map((b,i)=><div className="sv-zone-row" key={i}>
       <span className="sv-zname" style={{color:b.color}}>Z{i+1}</span>
       <div className="sv-zone-main">
        <div className="sv-zone-track"><div className="sv-zone-fill" style={{width:b.percentage+'%',backgroundColor:b.color}}/></div>
        <span>{zoneRange(b)}</span>
       </div><strong className="sv-zone-share">{decimal(b.percentage)}%</strong>
      </div>)}
      <p className="sv-note">{hrBands.valid.toLocaleString('de-DE')} gültige Garmin-HF-Messpunkte nach den hinterlegten Intervals.icu-Grenzen eingeordnet.
       <strong> Messpunktanteile, keine exakte Zeit in den Zonen.</strong>
      </p>
     </div>:<p className="sv-note">Für die Verteilung fehlen genügend gültige Garmin-HF-Messpunkte oder eindeutige Zonengrenzen.</p>}
     {zones.lthr!==null&&<div className="sv-below-kpi"><span>Hinterlegte LTHR</span><strong>{zones.lthr} bpm</strong></div>}
   </article>
   <article className="sv-panel">
    <div className="sv-heading"><div><span className="sv-eyebrow">INTERVALS.ICU / PACE-REFERENZ</span>
     <h4>Pace-Bereiche</h4></div><span className="sv-side-label">Schwellentempo</span></div>
    {paceBands.length>0?<div className="sv-pace-bands">
      {paceBands.map((z,i)=><div className="sv-pace-band" key={i}>
       <span className="sv-pace-tag" style={{borderColor:zoneColors[i%zoneColors.length],color:zoneColors[i%zoneColors.length]}}>Z{z.zone}</span>
       <div className="sv-pace-mid"><div className="sv-pace-track"><div style={{
          width:Math.max(8,Math.min(98,(z.percentage-45)/100*100))+'%',
          backgroundColor:zoneColors[i%zoneColors.length]}}/></div>
        <small>Grenze bei {pct(z.percentage)} %</small></div>
       <strong>{z.pace?z.pace+' /km':pct(z.percentage)+' %'}</strong>
      </div>)}
      {hasOpenPaceZone&&<div className="sv-pace-band sv-open-band">
       <span className="sv-pace-tag">↗</span><div className="sv-pace-mid">Offener schneller Bereich</div><strong>ohne Obergrenze</strong>
      </div>}
      <p className="sv-note">Pace-Grenzen aus der in Intervals.icu hinterlegten Schwellen-Geschwindigkeit.
       {zones.thresholdPace===null?' Ohne hinterlegte Schwellen-Geschwindigkeit keine Umrechnung in min/km.':''}
       {' '}Dies sind <strong>deine konfigurierten Referenzen</strong>, kein Solltempo für diesen Lauf.</p>
     </div>:<p className="sv-note">Für diese Sportart sind keine plausiblen Pace-Grenzen hinterlegt.</p>}
   </article>
  </div>}
  {!loading&&!zones&&availability.intervals&&<p className="sv-state">Intervals.icu liefert für diesen Zeitraum keine auswertbaren Laufzonen. Die Garmin-Wiederholungen bleiben sichtbar.</p>}
  <p className="sv-footer">Garmin liefert die gemessenen Werte, Intervals.icu die konfigurierten Zonen.
   Ein Ø-HF-Wert einer Wiederholung ist keine exakt gemessene Zonenzeit. Keine nachträgliche Zieltempo-Behauptung.</p>
 </section>
}
