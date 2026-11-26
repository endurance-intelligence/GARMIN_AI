import {useEffect,useMemo,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import type {SessionSample} from '../lib/sessionAnalysis'
import {heartZoneDistribution,zoneIndexForHr,splitBarHeight,paceLabel,compactHr,zoneColors} from '../lib/trainingVisuals.mjs'
import {displayPaceZoneLimits} from './IntervalsCoachContext'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import {selectReference} from './IntensityEvidencePanel'
import {assessIntensity} from '../lib/intensityEvidence'
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
export type SessionZoneSummary={activityId:string;lowShare:number;valid:number}
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
export function SessionVisualInsights({active,activityId,samples,activityDate,avgHr,averagePace,onZoneSummary}:{
 active:boolean;activityId:string;samples:SessionSample[];activityDate?:string|null;avgHr?:number|null;averagePace?:string;onZoneSummary?:(summary:SessionZoneSummary|null)=>void
}){
 const [tab,setTab]=useState<'hr'|'pace'|'info'>('hr')
 const [source,setSource]=useState<'intervals'|'garmin'>('intervals')
 const garminOpen=tab==='hr'&&source==='garmin'
 const {data:garminProfile,loading:garminLoading,error:garminError}=useGarminHrProfile(active&&garminOpen)
 const garminRef=useMemo(()=>selectReference(garminProfile,activityDate??null),[garminProfile,activityDate])
 const garminBands=useMemo(()=>assessIntensity(samples,garminRef.profile),[samples,garminRef.profile])
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
 const lowShare=hrBands?Math.round(1000*hrBands.bands.slice(0,2).reduce((n,b)=>n+b.count,0)/hrBands.valid)/10:null
 useEffect(()=>{onZoneSummary?.(hrBands&&lowShare!==null?{activityId,lowShare,valid:hrBands.valid}:null)},[activityId,hrBands,lowShare,onZoneSummary])
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
       <small className="sv-split-zone">Ø-HF in Z{zoneIndexForHr(s.avgHr,zones?.hrZones)} · Intervals</small>}
     </div>)}
   </div>
   <p className="sv-explainer">{isIntervals?
    'Nur FIT-Belastungsabschnitte – ohne Warm-up, Erholung und Cool-down. Balkenhöhe = relative Geschwindigkeit. Ø-HF-Zone = Bereich des Durchschnittspulses, nicht Zeitanteil und keine Trainingsnote.':
    'Garmin-Kilometerabschnitte. Unterschiede können durch Gelände und Tempoveränderungen entstehen. Balken stellen nur die relative Geschwindigkeit dar.'}
   </p>
  </article>}
  <article className="sv-panel sv-zones-unified">
   <div className="sv-heading"><div><span className="sv-eyebrow">GARMIN × INTERVALS.ICU</span><h4>Zonen &amp; Referenzen</h4><p className="sv-note">Ein Training. Zwei Referenzsysteme.</p></div></div>
   <div className="sv-segments" role="group" aria-label="Zonenansicht">
    {([['hr','Herzfrequenz'],['pace','Pace'],['info','Erklärung']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
   </div>
   {tab==='hr'&&<>
    <div className="sv-segments sv-source-switch" role="group" aria-label="Herzfrequenz-Referenzsystem">
     <button type="button" aria-pressed={source==='intervals'} onClick={()=>setSource('intervals')}>Intervals.icu</button>
     <button type="button" aria-pressed={source==='garmin'} onClick={()=>setSource('garmin')}>Garmin</button>
    </div>
    <div className="sv-zone-kpis"><div><small>Ø Herzfrequenz</small><strong>{typeof avgHr==='number'&&Number.isFinite(avgHr)&&avgHr>0?Math.round(avgHr):'–'} <em>bpm</em></strong></div>
     <div><small>{source==='intervals'?'In Intervals Z1 + Z2':'In und unter Garmin Z2'}</small><strong>{source==='intervals'?(lowShare===null?'–':pct(lowShare)):garminBands.belowZ1Z2Share===null?'–':pct(garminBands.belowZ1Z2Share)} <em>%</em></strong><small>Gültige HF-Messpunkte</small></div></div>
    {source==='intervals'?<>
     {hrBands?<div className="sv-hr-bands" role="img" aria-label="Anteil der Garmin-HF-Messpunkte in den persönlichen Intervals.icu-Zonen">
      {hrBands.bands.map((b,i)=><div className="sv-zone-row" key={i}>
       <span className="sv-zname" style={{color:b.color}}>Z{i+1}</span><div className="sv-zone-main"><div className="sv-zone-track"><div className="sv-zone-fill" style={{width:b.percentage+'%',backgroundColor:b.color}}/></div><span>{zoneRange(b)}</span></div><strong className="sv-zone-share">{pct(b.percentage)}%</strong>
      </div>)}
      <p className="sv-note">{hrBands.valid.toLocaleString('de-DE')} gültige Garmin-HF-Messpunkte · aktuell verfügbare Intervals.icu-Zonen. Keine historisch bestätigten Grenzen.</p>
     </div>:<p className="sv-note">{loading?'Intervals-Zonen werden geladen …':'Für die Verteilung fehlen genügend gültige Garmin-HF-Messpunkte oder eindeutige Intervals-Zonengrenzen.'}</p>}
     {zones?.lthr!=null&&<div className="sv-below-kpi"><span>Hinterlegte LTHR</span><strong>{zones.lthr} bpm</strong></div>}
    </>:<>
     {garminLoading&&<p className="sv-note" role="status">Lade persönliche Garmin-HF-Zonen …</p>}
     {garminError&&<p className="sv-note" role="status">{garminError}</p>}
     {garminBands.status==='sufficient'?<div className="sv-hr-bands" role="img" aria-label="Anteil der Herzfrequenz-Messpunkte je Garmin-Zone">
      {garminBands.bands.map((b,i)=><div className="sv-zone-row" key={b.key}><span className="sv-zname" style={{color:zoneColors[i%zoneColors.length]}}>{b.label}</span><div className="sv-zone-main"><div className="sv-zone-track"><div className="sv-zone-fill" style={{width:b.share+'%',backgroundColor:zoneColors[i%zoneColors.length]}}/></div><span>{b.lower===null?'≤ '+b.upper:b.upper===null?'≥ '+b.lower:b.lower+'–'+b.upper} bpm</span></div><strong className="sv-zone-share">{pct(b.share)}%</strong></div>)}
      <p className="sv-note">{garminBands.validSamples.toLocaleString('de-DE')} gültige HF-Messpunkte · {garminRef.kind==='historical'?'Historisch gespeichertes Garmin-Profil':'Aktuell gespeichertes Garmin-Profil, nicht rückwirkend bestätigt'}{garminRef.observedAt?' · Stand '+new Date(garminRef.observedAt).toLocaleDateString('de-DE'):''}.</p>
     </div>:!garminLoading&&<p className="sv-note">{garminBands.status==='insufficient'?'Mindestens 80 gültige HF-Messpunkte und 75 % HF-Abdeckung erforderlich.':'Eindeutige Garmin-Zonengrenzen fehlen. Keine Ersatz-Zonen geschätzt.'}</p>}
    </>}
    {(source==='intervals'?hrBands:garminBands.status==='sufficient')&&<p className="sv-zone-insight"><strong>Coach-Einordnung:</strong> {source==='intervals'?'Ein Anteil von '+pct(lowShare!)+' % in den ersten beiden konfigurierten Zonen beschreibt die gemessene Verteilung, nicht die physiologische Intensität.':'Garmin verwendet andere Grenzwerte. Die Einordnung kann deshalb deutlich abweichen, obwohl die HF-Messpunkte identisch sind.'}</p>}
    <p className="sv-note"><strong>Messpunktanteile, keine exakte Zeit in den Zonen.</strong> Unterschiedliche Zonengrenzen verändern die Einordnung, nicht die gemessene Herzfrequenz. Keine Aussage über LT1 oder Trainingsfreigabe.</p>
   </>}
   {tab==='pace'&&<>
    <div className="sv-zone-kpis"><div><small>Ø Pace</small><strong>{averagePace||'–'} <em>min/km</em></strong></div><div><small>Hinterlegtes Schwellentempo</small><strong>{zones?.thresholdPace?paceLabel(1000/zones.thresholdPace):'–'} <em>min/km</em></strong></div></div>
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
       {zones?.thresholdPace==null?' Ohne hinterlegte Schwellen-Geschwindigkeit keine Umrechnung in min/km.':''}
       {' '}Dies sind <strong>deine konfigurierten Referenzen</strong>, kein Solltempo für diesen Lauf.</p>
     </div>:<p className="sv-note">Für diese Sportart sind keine plausiblen Pace-Grenzen hinterlegt.</p>}
   </>}
   {tab==='info'&&<div className="sv-zone-method">
    <h5>Warum unterscheiden sich die Zonen?</h5><p>Garmin und Intervals.icu verwenden unterschiedliche persönliche Grenzwerte. Die Garmin-HF-Messpunkte bleiben identisch.</p>
    <h5>Welche Referenz wird angezeigt?</h5><p>Intervals.icu ist die Standardansicht; Garmin kann zum Vergleich gewählt werden. Intervals-Grenzen sind die aktuell verfügbaren Referenzen, Garmin verwendet wenn vorhanden das letzte Profil vor dem Lauf. Keine rückwirkende Soll-Erfüllung.</p>
    <h5>Messpunkte, nicht Zonenzeit</h5><p>Mindestens 80 gültige Messpunkte und 75 % HF-Abdeckung sind erforderlich. Prozentwerte sind keine exakten Zeitanteile und keine Trainingsnote.</p>
    <h5>Schwellenwerte und Trainingssteuerung</h5><p>LTHR bzw. LSHF ist nicht gleich LT1/VT1. Pace-Grenzen beruhen auf der hinterlegten Schwellengeschwindigkeit, nicht einem Solltempo für diesen Lauf. Keine physiologische 80/20-Quote und keine automatische Trainingsfreigabe.</p>
    {zones?.lthr!=null&&<div className="sv-below-kpi"><span>Intervals.icu LTHR</span><strong>{zones.lthr} bpm</strong></div>}
    {zones?.thresholdPace!=null&&zones.thresholdPace>0&&<div className="sv-below-kpi"><span>Intervals.icu Schwellentempo</span><strong>{paceLabel(1000/zones.thresholdPace)} min/km</strong></div>}
   </div>}
  </article>
  <p className="sv-footer">Garmin liefert die gemessenen Werte; die Zonengrenzen stammen aus dem jeweils gewählten Referenzsystem.
   Ein Ø-HF-Wert einer Wiederholung ist keine exakt gemessene Zonenzeit. Keine nachträgliche Zieltempo-Behauptung.</p>
 </section>
}
