import {useEffect,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import {berlinDateToday} from '../lib/coachGoal'
import {coachMonday} from '../lib/coachSevenDay.mjs'
import {assessRaceOutcome,listRaceDayActivities} from '../lib/raceOutcome.mjs'
import type {RaceOutcome,RaceDayActivity,RaceActivityLink} from '../lib/raceOutcome.mjs'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from './Icon'
import '../styles/race-after-action.css'

const clock=(mins:number)=>Math.floor(mins/60)+'h '+String(mins%60).padStart(2,'0')+'m'
type RaceBoard={activities:Record<string,unknown>[]}
export function RaceAfterActionCard({goal,plannedMinutes,onCoach}:{
 goal:CoachGoal;plannedMinutes:number|null;onCoach:()=>void
}){
 const [outcome,setOutcome]=useState<RaceOutcome|null>(null)
 const [board,setBoard]=useState<RaceBoard|null>(null)
 const [checks,setChecks]=useState<unknown[]>([])
 const [runs,setRuns]=useState<RaceDayActivity[]>([])
 const [selected,setSelected]=useState('')
 const [pending,setPending]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const raceEnded=goal.race_date<berlinDateToday()
 const build=(loadedBoard:RaceBoard,loadedLinks:RaceActivityLink[],loadedChecks:unknown[]) =>
  assessRaceOutcome({raceDate:goal.race_date,raceName:goal.race_name,
   raceDistanceKm:Number(goal.distance_km),plannedMinutes,
   board:loadedBoard,checks:loadedChecks,links:loadedLinks})

 useEffect(()=>{
  if(!raceEnded||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setPending(true);setError('');setNotice('');setOutcome(null);setBoard(null)
  setRuns([]);setSelected('');setChecks([])
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const headers={authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   const [week,context]=await Promise.all([
    fetch(garminSupabaseUrl+'/functions/v1/garmin-week-board?start='+
     encodeURIComponent(coachMonday(goal.race_date)),{cache:'no-store',signal:controller.signal,headers}),
    fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-context',{
     cache:'no-store',signal:controller.signal,headers})
   ])
   if(!week.ok||!context.ok)throw Error('Rennnachbereitung derzeit nicht erreichbar.')
   const [data,life]=await Promise.all([week.json(),context.json()])
   const nextBoard:RaceBoard={activities:Array.isArray(data.activities)?data.activities:[]}
   const nextLinks=Array.isArray(life?.context?.race_activity_links)?
    life.context.race_activity_links as RaceActivityLink[]:[]
   const nextChecks=Array.isArray(life?.context?.race_recovery_checks)?
    life.context.race_recovery_checks as unknown[]:[]
   const candidates=listRaceDayActivities({raceDate:goal.race_date,board:nextBoard})
   if(mounted){
    setBoard(nextBoard);setChecks(nextChecks);setRuns(candidates)
    setOutcome(build(nextBoard,nextLinks,nextChecks))
    if(candidates.length===1)setSelected(candidates[0].activityId)
   }
  })().catch(e=>{if(mounted&&e?.name!=='AbortError')
   setError(e instanceof Error?e.message:'Ergebnisdaten nicht verfügbar.')})
   .finally(()=>{if(mounted)setPending(false)})
  return ()=>{mounted=false;controller.abort()}
 },[raceEnded,goal.race_date,goal.race_name,goal.distance_km,plannedMinutes])

 async function changeLink(action:'confirm_race_activity'|'unlink_race_activity'){
  if(saving||!board||!garminSupabase)return
  if(action==='confirm_race_activity'&&!runs.some(r=>r.activityId===selected))return
  setSaving(true);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-context',{
    method:'POST',cache:'no-store',headers:{
     authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify({action,confirm:true,raceDate:goal.race_date,
     raceName:goal.race_name,
     ...(action==='confirm_race_activity'?{activityId:selected}:{})})
   })
   const payload=await response.json().catch(()=>({})) as {
    saved?:boolean;error?:string;context?:{race_activity_links?:RaceActivityLink[]}}
   if(!response.ok||payload.saved!==true||
    !Array.isArray(payload.context?.race_activity_links))
    throw Error(payload.error||'Zuordnung konnte nicht bestätigt werden.')
   const nextLinks=payload.context.race_activity_links
   setOutcome(build(board,nextLinks,checks))
   setNotice(action==='confirm_race_activity'?
    'Deine Zuordnung ist gespeichert und wird im Coach berücksichtigt.':
    'Die Zuordnung wurde gelöst. Der Coach prüft das Rennen wieder automatisch.')
   window.dispatchEvent(new Event('garmin-ai-coach-changed'))
  }catch(e){setError(e instanceof Error?e.message:'Zuordnung nicht möglich.')}
  finally{setSaving(false)}
 }
 if(!raceEnded)return null
 const matched=outcome?.matchStatus==='confirmed'||outcome?.matchStatus==='unique'
 const confirmed=outcome?.matchStatus==='confirmed'
 const partial=matched&&outcome?.partial===true
 return <section className="raa-root" aria-label="Rennnachbereitung mit echten Garmin-Daten">
  <div className="raa-heading">
   <Icon name="check-circle"/>
   <div><small>NACH DEM ZIEL · DEIN RÜCKBLICK</small>
    <strong>Plan, tatsächlicher Lauf &amp; Erholung</strong>
    <p>Garmin-Daten prüfen, damit der nächste Trainingsblock sinnvoll startet.</p></div>
  </div>
  {pending&&<p className="raa-note" role="status">Prüfe deine Garmin-Aufzeichnung …</p>}
  {error&&<p className="raa-note" role="alert">{error}</p>}
  {notice&&<p className="raa-note" role="status">{notice}</p>}
  {outcome&&<>
   {matched?<div className="raa-result">
    <div><small>Gelaufen · Garmin</small>
     <strong>{outcome.actualKm?.toLocaleString('de-DE')} km</strong>
     <span>{clock(outcome.actualMinutes!)}</span></div>
    <div><small>{partial?'Geplante Renndistanz':'Vergleich mit Rennplan'}</small>
     <strong>{partial?Number(goal.distance_km).toLocaleString('de-DE')+' km':
      outcome.planDeltaMinutes===null?'Keine Planzeit':
      (outcome.planDeltaMinutes>0?'+':'')+outcome.planDeltaMinutes+' Min.'}</strong>
     <span>{partial?'Wettkampf vorzeitig beendet · kein Vergleich mit der vollen Zielzeit':
      outcome.planDeltaMinutes===null?'Keine passende Planzeit hinterlegt':
      'Reiner Zeitvergleich; keine Leistungsbewertung'}</span></div>
   </div>:<p className="raa-note">
    {outcome.matchStatus==='ambiguous'?
     'Mehrere Garmin-Läufe passen zu Datum und Distanz. Bitte selbst zuordnen.':
     'Noch kein eindeutig passender Garmin-Lauf für den Wettkampf gefunden.'}
    {' '}Du kannst eine Aufzeichnung vom Renntag selbst bestätigen.</p>}
   {matched&&<p className="raa-note">{confirmed?
    'Diese Garmin-Aktivität hast du selbst dem Rennen zugeordnet.':
    'Automatische Zuordnung anhand von Renndatum und plausibler Distanz.'}
    {' '}Kein amtliches Rennergebnis.</p>}
   {matched&&(outcome.garminRpe!==null||outcome.garminFeeling!==null)&&
    <p className="raa-note">Dein Garmin-Feedback zum Rennen:
     {outcome.garminRpe!==null?' Anstrengung '+outcome.garminRpe+'/10.':''}
     {outcome.garminFeeling!==null?' Gefühl '+
      ({0:'sehr schwach',25:'schwach',50:'normal',75:'gut',100:'sehr gut'} as Record<number,string>)[outcome.garminFeeling]+'.':''}
     {' '}Automatisch übernommen, keine zweite Bewertung nötig.
    </p>}
   {outcome.raceCheck?<p className="raa-note">
    Dein Erholungs-Check vom {outcome.raceCheck.reportedOn.split('-').reverse().join('.')}:
    Erschöpfung {outcome.raceCheck.fatigue}/10 · Beine {outcome.raceCheck.soreness}/10.
    {outcome.raceCheck.warning?' Warnzeichen gemeldet – medizinisch abklären.':''}
   </p>:<p className="raa-note">Kein persönlicher Erholungs-Check vorhanden – dieser ist optional. Garmin-RPE und -Gefühl werden unabhängig davon berücksichtigt.</p>}
   {runs.length>0&&!confirmed&&
    <div className="raa-link">
     <strong>Ist das deine Aufzeichnung von diesem Wettkampf?</strong>
     <p>Ein Rennen kann auch vor der geplanten Distanz enden. Nur du bestätigst
      die Zuordnung; Garmin-Werte werden unverändert übernommen.</p>
     <label>Garmin-Lauf vom Renntag
      <select value={selected} onChange={e=>setSelected(e.target.value)} disabled={saving}>
       <option value="">Aufzeichnung auswählen</option>
       {runs.map(run=><option key={run.activityId} value={run.activityId}>
        {run.activityName} · {run.distanceKm.toLocaleString('de-DE')} km · {clock(run.durationMinutes)}
       </option>)}
      </select>
     </label>
     <button type="button" disabled={saving||!runs.some(r=>r.activityId===selected)}
      onClick={()=>void changeLink('confirm_race_activity')}>
      <Icon name="check"/> Diesen Garmin-Lauf dem Wettkampf zuordnen
     </button>
    </div>}
   {confirmed&&<button className="raa-unlink" type="button"
    disabled={saving} onClick={()=>void changeLink('unlink_race_activity')}>
    Zuordnung wieder lösen</button>}
   <p className="raa-note">{outcome.caveat}</p>
  </>}
  <button type="button" className="raa-coach" onClick={onCoach}>
   <Icon name="activity"/> Erholungs-Barometer im Coach öffnen <Icon name="arrow-up-right"/>
  </button>
 </section>
}
