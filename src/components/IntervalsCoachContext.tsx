import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/intervals-coach.css'

type Fitness={asOf:string;ctl:number;atl:number;form:number;ctlChange:number;atlChange:number;daysBetween:number}
type Zones={source:string;hrZones:number[];paceZones:number[];lthr:number|null;maxHr:number|null;
 hrNames:string[];paceNames:string[];thresholdPace:number|null}
type ActivityEvidence={load:number|null;intensity:number|null;decoupling:number|null;hrZoneSeconds:number[]}
type Insight={connected:boolean;trend:Fitness|null;zones:Zones|null;activity:ActivityEvidence|null;
 availability:{profile:boolean;wellness:boolean;activity:boolean};warnings?:string[]}
type Props={active:boolean;mode:'week'|'activity';weekStart?:string;activityId?:string;
 averageHr?:number|null;kilometerHrs?:number[];kind?:string}
const number=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const validHr=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=35&&x<=220
const paceFromSpeed=(speed:number)=>{const secs=Math.round(1000/speed);return Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')}
/** Intervals.icu pace_zones are percentages of threshold SPEED, NOT seconds/km.
 * threshold_pace is SI m/s, irrespective of pace_units display settings.
 * 999 means an open final zone and must not be printed as a pace. */
export function displayPaceZoneLimits(limits:number[],thresholdPace:number|null){
 const threshold=typeof thresholdPace==='number'&&Number.isFinite(thresholdPace)&&thresholdPace>=1.2&&thresholdPace<=8?thresholdPace:null
 return limits.filter(x=>Number.isFinite(x)&&x>=40&&x<250).slice(0,10).map((p,i)=>({
  zone:i+1,percentage:p,pace:threshold?paceFromSpeed(threshold*p/100):null
 }))
}
/** A compact evidence source inside the existing coach review, never a second verdict. */
export function IntervalsCoachContext({active,mode,weekStart,activityId,averageHr,kilometerHrs,kind}:Props){
 const [data,setData]=useState<Insight|null>(null)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 useEffect(()=>{
  if(!active||!garminSupabase||(mode==='activity'&&!activityId)||(mode==='week'&&!weekStart))return
  const controller=new AbortController()
  let mounted=true
  setData(null);setError('');setLoading(true)
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)return
   const query=mode==='activity'?'?id='+encodeURIComponent(activityId||''):'?start='+encodeURIComponent(weekStart||'')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-intervals-insights'+query,{
    method:'GET',cache:'no-store',signal:controller.signal,
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   })
   if(!response.ok)throw Error('Intervals.icu-Zusatzdaten momentan nicht abrufbar.')
   const json=await response.json() as Insight
   if(mounted)setData(json)
  })().catch(e=>{if(mounted&&!(e instanceof Error&&e.name==='AbortError'))setError('Intervals.icu momentan nicht erreichbar.')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,mode,weekStart,activityId])
 if(!active)return null
 if(!data&&!loading&&!error)return null
 if(loading)return <p className="ic-context ic-muted">Intervals.icu ergänzt die Trainingsdaten …</p>
 if(error)return <details className="ic-context"><summary>Intervals.icu · Zusatzdaten derzeit nicht verfügbar</summary>
  <p>Die Garmin-Laufbewertung ist davon unabhängig.</p></details>
 if(!data?.connected)return <details className="ic-context"><summary>Intervals.icu noch nicht verbunden</summary>
  <p>Über Einstellungen verbinden – Garmin bleibt die Grundlage deiner Laufanalyse.</p></details>
 const trend=mode==='week'?data.trend:null
 const matched=mode==='activity'?data.activity:null
 const zones=data.zones
 const firstHrLimit=zones?.hrZones?.[0]
 const validKilometerHrs=(kilometerHrs||[]).filter(validHr)
 const aboveFirst=typeof firstHrLimit==='number'?validKilometerHrs.filter(x=>x>firstHrLimit).length:0
 const hasInfo=!!trend||!!matched||!!zones
 if(!hasInfo)return <details className="ic-context"><summary>Intervals.icu · keine ergänzenden Werte</summary>
   <p>Keine verlässlichen Zusatzdaten für diesen Zeitraum. Die Garmin-Bewertung bleibt gültig.</p></details>
 return <div className="ic-context ic-glance" aria-label="Kurze Intervals.icu-Ergänzung zum Coach-Fazit">
  <div className="ic-glance-head"><span className="ic-source">INTERVALS.ICU · ZUSATZCHECK</span>
   {mode==='activity'&&<small>Details unten als Grafik</small>}</div>
  {mode==='activity'&&<div className="ic-glance-values">
   {matched?.load!==null&&matched?.load!==undefined&&
    <div className="ic-glance-stat"><span>TRAININGSBELASTUNG</span><strong>{number(matched.load)}</strong><small>Intervals Load</small></div>}
   {matched?.intensity!==null&&matched?.intensity!==undefined&&
    <div className="ic-glance-stat"><span>INTENSITÄT</span><strong>{number(matched.intensity)}</strong><small>Intervals-Faktor</small></div>}
   {kind==='easy'&&typeof firstHrLimit==='number'&&validKilometerHrs.length>=4&&
    <div className="ic-glance-stat"><span>HF-KONTEXT</span>
     <strong>{validKilometerHrs.length-aboveFirst}/{validKilometerHrs.length}</strong>
     <small>km Ø-HF bis {firstHrLimit} bpm</small></div>}
   {!matched&&<p className="ic-muted">Für diesen Lauf keine eindeutig zugeordnete Intervals.icu-Belastung.
    Garmin bleibt die Bewertungsgrundlage.</p>}
  </div>}
  {mode==='week'&&trend&&<div className="ic-glance-values">
   <div className="ic-glance-stat"><span>FITNESS / CTL</span><strong>{number(trend.ctl)}</strong>
    <small>{trend.ctlChange>=0?'+':''}{number(trend.ctlChange)} im Verlauf</small></div>
   <div className="ic-glance-stat"><span>FATIGUE / ATL</span><strong>{number(trend.atl)}</strong>
    <small>Trainingsbelastung</small></div>
   <div className="ic-glance-stat"><span>FORM</span><strong>{trend.form>=0?'+':''}{number(trend.form)}</strong>
    <small>Stand {trend.asOf}</small></div>
  </div>}
  {mode==='week'&&!trend&&<p className="ic-muted">Kein durchgehender Fitness-/Fatigue-Verlauf für diese Woche verfügbar.</p>}
  {mode==='activity'&&<p className="ic-glance-foot">Garmin bewertet den Lauf. Persönliche HF- und Pace-Zonen
   sowie die Wiederholungen findest du weiter unten bei „Trainingszonen & Wiederholungen“.
   Die Intervals-Zonen sind konfigurierte Referenzen, kein LT1-Nachweis.</p>}
  {mode==='week'&&<p className="ic-glance-foot">Belastungstrend als Kontext, keine automatische Trainingsfreigabe.</p>}
 </div>
}