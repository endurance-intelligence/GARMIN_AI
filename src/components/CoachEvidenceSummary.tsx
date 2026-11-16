import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/coach-evidence-summary.css'
import {IntervalsCoachContext} from './IntervalsCoachContext'

type Review={activityId:string;date:string;name:string;type:string;headline:string;
 positive:string;attention:string;goal:string;quality:string;source:string;short:string}
type Week={weekStart:string;endExclusive:string;runCount:number;distanceKm:number;previousKm:number;
 intervalCount:number;footballCount:number;observation:string;effort:string;next:string}
type Result={source:string;week:Week;reviews:Review[];updatedAt:string}
type Props={active:boolean;mode:'calendar'|'training'|'weekly';weekStart?:string;selectedDate?:string;activityId?:string}
function monday(day:string){
 const date=new Date(day+'T12:00:00Z'),delta=(date.getUTCDay()+6)%7
 date.setUTCDate(date.getUTCDate()-delta)
 return date.toISOString().slice(0,10)
}
function todayBerlin(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const value=(key:string)=>parts.find(x=>x.type===key)?.value||''
 return value('year')+'-'+value('month')+'-'+value('day')
}
export function CoachEvidenceSummary({active,mode,weekStart,selectedDate,activityId}:Props){
 const start=weekStart||monday(todayBerlin())
 const [result,setResult]=useState<Result|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [loggedIn,setLoggedIn]=useState(true)
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setBusy(true);setError('');setResult(null)
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session){if(mounted)setLoggedIn(false);return}
   if(mounted)setLoggedIn(true)
   const query=activityId?'?id='+encodeURIComponent(activityId):'?start='+encodeURIComponent(start)
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-review'+query,{
    method:'GET',cache:'no-store',signal:controller.signal,
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   })
   if(!response.ok)throw Error('Coach-Fazits vorübergehend nicht verfügbar (HTTP '+response.status+').')
   const json=await response.json() as Result
   if(!json||!Array.isArray(json.reviews)||!json.week)throw Error('Coach-Antwort unvollständig.')
   if(mounted)setResult(json)
  })().catch(e=>{
   if(mounted&&!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Coach-Fazit nicht verfügbar.')
  }).finally(()=>{if(mounted)setBusy(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,activityId,start])
 if(!active)return null
 const reviews=(result?.reviews||[]).filter(r=>mode==='training'?r.activityId===activityId:mode==='calendar'?r.date===selectedDate:false)
 const showWeek=mode==='weekly'||mode==='calendar'
 if(!garminSupabase||!loggedIn)return null
 return <section className={'cr-wrap cr-mode-'+mode} aria-label="Coach-Fazits aus Garmin-Daten">
  {busy&&<div className="cr-meta" role="status">Coach wertet absolvierte Einheiten aus …</div>}
  {error&&<p className="cr-error" role="status">{error}</p>}
  {result&&showWeek&&<article className="cr-week">
   <div className="cr-label">COACH / WOCHENRÜCKBLICK · GEMESSENE EINHEITEN</div>
   <h3>{result.week.runCount} {result.week.runCount===1?'Lauf':'Läufe'} · {result.week.distanceKm.toLocaleString('de-DE',{maximumFractionDigits:1})} km</h3>
   <p>{result.week.observation} {result.week.effort}</p>
   <p className="cr-next"><strong>Für die nächste Woche:</strong> {result.week.next}</p>
   <IntervalsCoachContext active={active} mode="week" weekStart={start}/>
  </article>}
  {result&&reviews.map(r=><article key={r.activityId} className="cr-card">
   <div className="cr-label">COACH / FAZIT · {r.date} · {r.source}</div>
   <h3>{r.name}</h3>
   <strong className="cr-headline">{r.headline}</strong>
   <p>{r.positive}</p>
   <p className="cr-attention">{r.attention}</p>
   <p className="cr-goal"><strong>Hauptziel:</strong> {r.goal}</p>
   {r.quality==='limited'&&<small>Bewertung eingeschränkt: fehlende Abschnittsdaten werden nicht geschätzt.</small>}
   <IntervalsCoachContext active={active} mode="activity" activityId={r.activityId}/>
  </article>)}
  {result&&mode==='calendar'&&reviews.length===0&&<p className="cr-meta">Für diesen Tag ist kein abgeschlossener Lauf erfasst.</p>}
 </section>
}