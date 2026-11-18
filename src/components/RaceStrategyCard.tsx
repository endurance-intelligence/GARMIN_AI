import {useEffect,useRef,useState} from 'react'
import {Icon} from './Icon'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {estimateRaceStrategy} from '../lib/raceStrategyMath.mjs'
import {recommendRacePlan} from '../lib/raceAutoPlan.mjs'
import type {Forecast} from '../lib/weatherIntelligence'
import {RaceExecutionCard} from './RaceExecutionCard'
import {GelInventoryPlanner} from './GelInventoryPlanner'
import {RaceAfterActionCard} from './RaceAfterActionCard'
import type {CoachGoal} from '../lib/coachGoal'
import '../styles/race-strategy.css'

type Mode='laps'|'point_to_point'|'other'
type Draft={
 courseMode:Mode;loopKm:string;movingMinutes:string;regularPause:string;
 longStopEvery:string;longStopMinutes:string;pace:string;
 carbs:string;fluid:string;sodium:string;fuelNotes:string;stopsNotes:string;gearNotes:string
}
const blank:Draft={courseMode:'laps',loopKm:'',movingMinutes:'',regularPause:'',
 longStopEvery:'',longStopMinutes:'',pace:'',carbs:'',fluid:'',sodium:'',
 fuelNotes:'',stopsNotes:'',gearNotes:''}
const str=(v:unknown)=>v===null||v===undefined?'':String(v)
const asDraft=(row:Record<string,unknown>):Draft=>({
 courseMode:['laps','point_to_point','other'].includes(String(row.course_mode))?
  row.course_mode as Mode:'laps',
 loopKm:str(row.loop_km),movingMinutes:str(row.moving_minutes_per_loop),
 regularPause:str(row.pause_minutes_per_loop),longStopEvery:str(row.long_stop_every),
 longStopMinutes:str(row.long_stop_minutes),
 pace:typeof row.target_pace_seconds==='number'?Math.floor(row.target_pace_seconds/60)+':'+
  String(row.target_pace_seconds%60).padStart(2,'0'):'',
 carbs:str(row.carbs_g_per_hour),fluid:str(row.fluid_ml_per_hour),
 sodium:str(row.sodium_mg_per_hour),fuelNotes:str(row.fuel_notes),
 stopsNotes:str(row.stops_notes),gearNotes:str(row.gear_notes)
})
const asNumber=(text:string,min:number,max:number,integer=true)=>{
 const raw=text.trim()
 if(raw==='')return null
 const value=Number(raw.replace(',','.'))
 if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))
  throw Error('Bitte die Zahlen und Einheiten prüfen.')
 return value
}
const asPace=(v:string)=>{
 if(!v.trim())return null
 const match=/^(\d{1,2}):([0-5]\d)$/.exec(v.trim())
 if(!match)throw Error('Tempo bitte als Minuten:Sekunden eingeben, z. B. 06:50.')
 const seconds=Number(match[1])*60+Number(match[2])
 if(seconds<180||seconds>1200)throw Error('Bitte ein Tempo zwischen 03:00 und 20:00 min/km eintragen.')
 return seconds
}
function NumberField({label,value,onChange,min,max,step='1',placeholder}:{
 label:string;value:string;onChange:(value:string)=>void;min:number;max:number;
 step?:string;placeholder?:string
}){
 return <label>{label}<input type="number" value={value} inputMode="decimal"
  min={min} max={max} step={step} placeholder={placeholder||'Optional'}
  onChange={e=>onChange(e.target.value)}/></label>
}
export function RaceStrategyCard({active,onCoach,forecast}:{active:boolean;onCoach:()=>void;forecast?:Forecast|null}){
 const [goal,setGoal]=useState<CoachGoal|null>(null)
 const [weightKg,setWeightKg]=useState<number|null>(null)
 const [draft,setDraft]=useState<Draft>(blank)
 const [saved,setSaved]=useState(false)
 const [busy,setBusy]=useState(false)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const loadedKey=useRef<string|null>(null)
 const update=<K extends keyof Draft,>(name:K,value:Draft[K])=>{
  setDraft(old=>({...old,[name]:value}));setSaved(false);setNotice('Änderung noch nicht gespeichert.')
 }
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let live=true
  const controller=new AbortController()
  setLoading(true);setError('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-goal',{
    method:'GET',cache:'no-store',signal:controller.signal,
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   })
   const result=await response.json().catch(()=>({})) as {goal:CoachGoal|null;error?:string}
   if(!response.ok)throw Error(result.error||'Aktuelles Ziel nicht erreichbar.')
   if(!live)return
   const nextGoal=result.goal
   setGoal(nextGoal)
   void garminSupabase.from('garmin_weight_outbox').select('weight_kg')
    .order('weigh_date',{ascending:false}).limit(1).maybeSingle()
    .then(({data})=>{const kg=Number(data?.weight_kg);if(live&&data&&kg>=30&&kg<=250)setWeightKg(kg)})
   if(!nextGoal){setSaved(false);loadedKey.current=null;return}
   const key=nextGoal.race_date+'|'+nextGoal.race_name
   // Preserve unsaved changes when switching tabs; a different event gets its own draft.
   if(key===loadedKey.current)return
   const {data,error:dbError}=await garminSupabase.from('garmin_race_strategy')
    .select('*').eq('user_id',session.user.id).eq('race_date',nextGoal.race_date)
    .eq('race_name',nextGoal.race_name).maybeSingle()
   if(dbError)throw Error('Rennstrategie derzeit nicht verfügbar: '+dbError.message)
   if(!live)return
   const suggested=recommendRacePlan(nextGoal)
   setDraft(data?asDraft(data as Record<string,unknown>):suggested??blank)
   setSaved(Boolean(data))
   setNotice(data?'':suggested?'Aus deinem gespeicherten Ziel automatisch vorbereitet. Du kannst den Vorschlag anpassen.':'')
   loadedKey.current=key
  })().catch(e=>{if(live&&e?.name!=='AbortError')setError(
   e instanceof Error?e.message:'Rennstrategie konnte nicht geladen werden.')})
   .finally(()=>{if(live)setLoading(false)})
  return ()=>{live=false;controller.abort()}
 },[active])
 const get=(v:string)=>v.trim()===''?null:Number(v.replace(',','.'))
 const loop=get(draft.loopKm),moving=get(draft.movingMinutes),regular=get(draft.regularPause)
 const every=get(draft.longStopEvery),long=get(draft.longStopMinutes)
 let pace:number|null=null
 try{pace=asPace(draft.pace)}catch{/* Only show estimate for valid inputs. */}
 const startHour=goal?.race_start_time?Number(goal.race_start_time.slice(0,2)):null
 const firstWeather=forecast&&goal&&startHour!==null?
  forecast.hours.findIndex(h=>h.date===goal.race_date&&h.hour===startHour):-1
 const raceHours=forecast&&goal&&firstWeather>=0&&goal.target_hours?
  forecast.hours.slice(firstWeather,firstWeather+Math.ceil(goal.target_hours)):[]
 const feels=raceHours.length&&raceHours.every((h,i)=>h.epoch===raceHours[0].epoch+i*3600)?
  [Math.round(Math.min(...raceHours.map(h=>h.feelsLike))),
   Math.round(Math.max(...raceHours.map(h=>h.feelsLike)))]:null
 const calculation=goal?estimateRaceStrategy({
  distanceKm:Number(goal.distance_km),courseMode:draft.courseMode,
  loopKm:loop,movingMinutes:moving,regularPauseMinutes:regular,
  longStopEvery:every,longStopMinutes:long,paceSeconds:pace
 }):null
 async function save(){
  if(busy||!goal||!garminSupabase)return
  setBusy(true);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const payload={
    user_id:session.user.id,race_date:goal.race_date,race_name:goal.race_name,
    course_mode:draft.courseMode,
    loop_km:asNumber(draft.loopKm,0.01,100,false),
    moving_minutes_per_loop:asNumber(draft.movingMinutes,10,360),
    pause_minutes_per_loop:asNumber(draft.regularPause,0,120),
    long_stop_every:asNumber(draft.longStopEvery,2,50),
    long_stop_minutes:asNumber(draft.longStopMinutes,0,120),
    target_pace_seconds:asPace(draft.pace),
    carbs_g_per_hour:asNumber(draft.carbs,0,150),
    fluid_ml_per_hour:asNumber(draft.fluid,0,1500),
    sodium_mg_per_hour:asNumber(draft.sodium,0,3000),
    fuel_notes:draft.fuelNotes.trim(),stops_notes:draft.stopsNotes.trim(),
    gear_notes:draft.gearNotes.trim(),updated_at:new Date().toISOString()
   }
   if([payload.fuel_notes,payload.stops_notes,payload.gear_notes].some(v=>v.length>500))
    throw Error('Bitte höchstens 500 Zeichen pro Notiz verwenden.')
   const {data,error:dbError}=await garminSupabase.from('garmin_race_strategy')
    .upsert(payload,{onConflict:'user_id,race_date,race_name'}).select('race_date').single()
   if(dbError||!data)throw Error(dbError?.message||'Speicherung nicht bestätigt.')
   setSaved(true);setNotice('Dein Rennplan ist gespeichert. Keine automatischen Trainings- oder Garmin-Änderungen.')
  }catch(e){setError(e instanceof Error?e.message:'Rennplan nicht gespeichert.')}
  finally{setBusy(false)}
 }
 if(!active)return null
 return <details className="rsp-root" open aria-label="Deine Rennstrategie und Verpflegung">
  <summary className="rsp-heading">
   <span className="rsp-heading-icon"><Icon name="flag"/></span>
   <span className="rsp-heading-copy">
    <small>DEIN NÄCHSTES EVENT / RENNPLAN</small>
    <strong>Tempo, Verpflegung &amp; Pausen</strong>
    <span>{goal?goal.race_name+' · '+goal.race_date.split('-').reverse().join('.'):
     'Bitte zuerst dein Hauptziel unter Goals festlegen.'}</span>
   </span>
   <span className="rsp-state">{saved?'Gespeichert':loading?'Lädt …':goal&&recommendRacePlan(goal)?'Auto-Plan':'Entwurf'}</span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="rsp-body">
   {error&&<p className="rsp-error" role="alert">{error}</p>}
   {notice&&<p className="rsp-success" role="status">{notice}</p>}
   {goal&&<>
    <p className="rsp-context"><strong>{goal.race_name}</strong> · {Number(goal.distance_km).toLocaleString('de-DE')} km.
     Aus Hauptziel, bisherigen Rennabsprachen und gespeicherter Strategie vorbereitet.
     Anpassungen sind optional; Trainings- und Garmin-Daten werden nicht verändert.</p>
    {feels&&<p className="rsp-weather">🌡️ Rennwetter: gefühlt <strong>{feels[0]}–{feels[1]} °C</strong>.
     Trinkmenge und Kleidung nach tatsächlichem Wetter, Durst und Verträglichkeit anpassen.</p>}
    {calculation&&<RaceExecutionCard saved={saved} weightKg={weightKg} input={{
      distanceKm:Number(goal.distance_km),courseMode:draft.courseMode,loopKm:loop,
      movingMinutes:moving,regularPauseMinutes:regular,longStopEvery:every,
      longStopMinutes:long,paceSeconds:pace,targetHours:goal.target_hours,
      carbsGPerHour:get(draft.carbs),fluidMlPerHour:get(draft.fluid),
      sodiumMgPerHour:get(draft.sodium)
     }}/>}
    <GelInventoryPlanner active={active} goal={goal}
      durationMinutes={calculation?.totalMinutes??null} carbsGPerHour={get(draft.carbs)}/>
    <div className="rsp-ready-notes" aria-label="Vorbereitete Versorgung und Ausrüstung">
     {draft.fuelNotes&&<article><strong>🥤 Verpflegung und KH</strong><p>{draft.fuelNotes}</p></article>}
     {draft.stopsNotes&&<article><strong>⏱️ Stopps und Wechsel</strong><p>{draft.stopsNotes}</p></article>}
     {draft.gearNotes&&<article><strong>🎒 Packliste</strong><p>{draft.gearNotes}</p></article>}
    </div>
    <details className="rsp-edit">
     <summary><Icon name="settings"/> Planwerte, Produkte und Stopps bei Bedarf bearbeiten</summary>
    <div className="rsp-section">
     <h3><Icon name="clock"/> Renn- und Pausenstrategie</h3>
     <div className="rsp-grid">
      <label>Streckenart<select value={draft.courseMode} disabled={busy}
       onChange={e=>update('courseMode',e.target.value as Mode)}>
       <option value="laps">Rundenrennen</option>
       <option value="point_to_point">Punkt-zu-Punkt-Rennen</option>
       <option value="other">Andere Strecke</option>
      </select></label>
      {draft.courseMode==='laps'?<>
       <NumberField label="Rundenlänge (km)" value={draft.loopKm}
        onChange={v=>update('loopKm',v)} min={0.01} max={100} step="0.01" placeholder="z. B. 6"/>
       <NumberField label="Laufzeit je voller Runde (Min.)" value={draft.movingMinutes}
        onChange={v=>update('movingMinutes',v)} min={10} max={360} placeholder="z. B. 42"/>
       <NumberField label="Normale Pause je Runde (Min.)" value={draft.regularPause}
        onChange={v=>update('regularPause',v)} min={0} max={120} placeholder="z. B. 3"/>
       <NumberField label="Lange Pause alle ... Runden" value={draft.longStopEvery}
        onChange={v=>update('longStopEvery',v)} min={2} max={50} placeholder="z. B. 3"/>
       <NumberField label="Zusätzliche lange Pause (Min.)" value={draft.longStopMinutes}
        onChange={v=>update('longStopMinutes',v)} min={0} max={120} placeholder="z. B. 10"/>
      </>:<label>Geplantes Lauftempo (min/km)<input value={draft.pace}
       disabled={busy} inputMode="text" placeholder="z. B. 06:50"
       onChange={e=>update('pace',e.target.value)}/></label>}
     </div>
     {calculation&&<div className="rsp-estimate" role="status">
      <strong>Deine grobe Zeitrechnung: {calculation.formattedTotal}</strong>
      <span>{calculation.rounds!==null?calculation.rounds+' Runden (letzte ggf. kürzer) · ':''}
       {calculation.movingMinutes} Min. Bewegung
       {calculation.breakMinutes>0?' · '+calculation.breakMinutes+' Min. Pausen':''}
       {calculation.extraStops>0?' · '+calculation.extraStops+' Zusatzstopps':''}</span>
      <small>Nur eine Rechnung aus deinen Eingaben. Wetter, Versorgung und unerwartete Stopps
       können die tatsächliche Zeit verändern.</small>
     </div>}
     <label className="rsp-wide">Stopps, Kleidung, Schuhe oder Wechsel planen
      <textarea rows={2} maxLength={500} value={draft.stopsNotes} disabled={busy}
       placeholder="Wo und wann längere Stopps, Schuhwechsel oder Wechselkleidung?"
       onChange={e=>update('stopsNotes',e.target.value)}/></label>
    </div>
    <div className="rsp-section">
     <h3><Icon name="droplets"/> Verpflegung &amp; Trinken</h3>
     <div className="rsp-grid">
      <NumberField label="Kohlenhydrate (g/Stunde)" value={draft.carbs}
       onChange={v=>update('carbs',v)} min={0} max={150}/>
      <NumberField label="Trinken (ml/Stunde)" value={draft.fluid}
       onChange={v=>update('fluid',v)} min={0} max={1500}/>
      <NumberField label="Natrium (mg/Stunde, optional)" value={draft.sodium}
       onChange={v=>update('sodium',v)} min={0} max={3000}/>
     </div>
     <label className="rsp-wide">Produkte und Verpflegungspunkte
      <textarea rows={2} maxLength={500} disabled={busy} value={draft.fuelNotes}
       placeholder="Welche Gels, Getränke, Lebensmittel und an welchem Versorgungspunkt?"
       onChange={e=>update('fuelNotes',e.target.value)}/></label>
    </div>
    <div className="rsp-section">
     <h3><Icon name="check-circle"/> Ausrüstung &amp; Organisation</h3>
     <label className="rsp-wide">Packliste, Kleidung, Start und Anfahrt
      <textarea rows={2} maxLength={500} disabled={busy} value={draft.gearNotes}
       placeholder="Wechselkleidung, Ersatzschuhe, Stirnlampe, Anreise usw."
       onChange={e=>update('gearNotes',e.target.value)}/></label>
    </div>
    </details>
    <RaceAfterActionCard goal={goal} plannedMinutes={calculation?.totalMinutes??null}
     onCoach={onCoach}/>
    <div className="rsp-actions">
     <p>Deine Rennstrategie bleibt privat in GARMIN_AI. Keine automatische Trainingsfreigabe.</p>
     <button type="button" disabled={busy||loading} onClick={()=>void save()}>
      <Icon name="check"/> {busy?'Speichere …':'Rennplan speichern'}
     </button>
    </div>
   </>}
   {!goal&&!loading&&<p>Lege zuerst dein Hauptziel unter <strong>Goals</strong> fest.</p>}
  </div>
 </details>
}
