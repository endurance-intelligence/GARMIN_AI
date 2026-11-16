import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/intervals-coach.css'

type Fitness={asOf:string;ctl:number;atl:number;form:number;ctlChange:number;atlChange:number;daysBetween:number}
type Zones={source:string;hrZones:number[];paceZones:number[];lthr:number|null;maxHr:number|null;
 hrNames:string[];paceNames:string[];thresholdPace:number|null}
type ActivityEvidence={load:number|null;intensity:number|null;decoupling:number|null;hrZoneSeconds:number[]}
type Insight={connected:boolean;trend:Fitness|null;zones:Zones|null;activity:ActivityEvidence|null;
 availability:{profile:boolean;wellness:boolean;activity:boolean};warnings?:string[]}
type Props={active:boolean;mode:'week'|'activity';weekStart?:string;activityId?:string}
const number=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
/** A compact evidence source inside the existing coach review, never a second verdict. */
export function IntervalsCoachContext({active,mode,weekStart,activityId}:Props){
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
 const hasInfo=!!trend||!!matched||!!zones
 if(!hasInfo)return <details className="ic-context"><summary>Intervals.icu · keine ergänzenden Werte</summary>
   <p>Keine verlässlichen Zusatzdaten für diesen Zeitraum. Die Garmin-Bewertung bleibt gültig.</p></details>
 return <div className="ic-context" aria-label="Intervals.icu ergänzt den Garmin-Coach">
  <div className="ic-source">INTERVALS.ICU · ERGÄNZENDE DATEN</div>
  {trend&&<p><strong>Belastungstrend:</strong> Fitness (CTL) {number(trend.ctl)},
   Fatigue (ATL) {number(trend.atl)}, Form {trend.form>=0?'+':''}{number(trend.form)}.
   {trend.daysBetween>0&&<> CTL-Änderung {trend.ctlChange>=0?'+':''}{number(trend.ctlChange)}
    in {trend.daysBetween} Tagen.</>}
   <small> Stand {trend.asOf} · Trendwerte, keine automatische Freigabe</small></p>}
  {matched&&<p><strong>Belastung dieses Laufs:</strong> {matched.load===null?'Kein Belastungswert verfügbar':number(matched.load)+' Intervals.icu Load'}.
    {matched.intensity!==null&&<> Intensitätsfaktor {number(matched.intensity)}.</>}
    <small> Eindeutig dem Garmin-Lauf zugeordnet · nicht doppelt gezählt</small></p>}
  {mode==='activity'&&!matched&&zones&&<p className="ic-muted">Keine eindeutige Intervals.icu-Aktivität zugeordnet. Persönliche Zonen sind trotzdem verfügbar.</p>}
  {zones&&<details className="ic-zones"><summary>Persönliche Intervals.icu-Laufzonen ansehen</summary>
    {zones.hrZones.length>0&&<p>HF-Grenzen: {zones.hrZones.join(' · ')} bpm</p>}
    {zones.lthr!==null&&<p>Hinterlegte LTHR: {zones.lthr} bpm (nicht automatisch LT1).</p>}
    {zones.paceZones.length>0&&<p>Pace-Zonengrenzen laut Intervals.icu: {zones.paceZones.join(' · ')} (API-Rohwerte)</p>}
    <small>Konfigurierte Zonen in Intervals.icu. Keine automatisch getesteten physiologischen Schwellen.</small>
   </details>}
 </div>
}