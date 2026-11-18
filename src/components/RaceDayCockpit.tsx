import {useEffect,useMemo,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import type {GelPlanEvent} from '../lib/gelTiming.mjs'
import type {RaceMarks} from '../lib/raceDayCockpit.mjs'
import {buildRaceDayCockpit,formatRaceElapsed,parseRaceElapsed,raceElapsedNow,
 recordRaceMark,sanitizeRaceMarks,undoLastRaceMark,raceDayLogText} from '../lib/raceDayCockpit.mjs'
import {clockAt} from '../lib/gelTiming.mjs'
import {Icon} from './Icon'
import '../styles/race-day-cockpit.css'

type Input={distanceKm:number;courseMode:string;loopKm:number|null;
 movingMinutes:number|null;regularPauseMinutes:number|null;longStopEvery:number|null;
 longStopMinutes:number|null;paceSeconds:number|null;targetHours:number|null;
 carbsGPerHour:number|null;fluidMlPerHour:number|null;sodiumMgPerHour:number|null}
const clockOK=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const signed=(n:number)=>n===0?'genau im Plan':Math.abs(n)+' Min. '+(n>0?'Vorsprung':'Rückstand')
const fuelName=(e:GelPlanEvent)=>e.brand+' · '+e.name

/** Athlete-entered offline record: this browser only. No synthetic GPS, no cloud sync. */
export function RaceDayCockpit({active,goal,input,saved,viewerId,fuelSchedule,feelsLike}:{
 active:boolean;goal:CoachGoal;input:Input;saved:boolean;viewerId:string;
 fuelSchedule:GelPlanEvent[]|null;feelsLike:[number,number]|null
}){
 const [marks,setMarks]=useState<RaceMarks>({})
 const [startTime,setStartTime]=useState(goal.race_start_time||'')
 const [startInput,setStartInput]=useState(goal.race_start_time||'')
 const [editIndex,setEditIndex]=useState(1)
 const [editKind,setEditKind]=useState<'arrival'|'departure'>('arrival')
 const [editValue,setEditValue]=useState('')
 const [loaded,setLoaded]=useState(false)
 const [status,setStatus]=useState('')
 const [error,setError]=useState('')
 const [backupOpen,setBackupOpen]=useState(false)
 const key='garmin-ai:race-day:v1:'+encodeURIComponent(viewerId)+'|'+
  encodeURIComponent(goal.race_date)+'|'+encodeURIComponent(goal.race_name)
 const model=useMemo(()=>buildRaceDayCockpit({
  input,marks,startTime:clockOK(startTime)?startTime:null
 }),[input,marks,startTime])
 useEffect(()=>{
  if(!active||!viewerId)return
  setLoaded(false);setError('');setStatus('')
  try{
   const raw=localStorage.getItem(key)
   const stored=raw?JSON.parse(raw):null
   const from=stored&&stored.version===1&&stored.raceDate===goal.race_date&&
    stored.raceName===goal.race_name?stored:null
   const actual=from?.marks&&typeof from.marks==='object'?from.marks:{}
   const value=typeof from?.startTime==='string'&&clockOK(from.startTime)?
    from.startTime:goal.race_start_time||''
   setMarks(actual)
   setStartTime(value);setStartInput(value)
   setLoaded(true)
  }catch{
   setMarks({});setStartTime(goal.race_start_time||'')
   setStartInput(goal.race_start_time||'');setLoaded(true)
   setError('Lokaler Rennspeicher nicht lesbar. Einträge erst nach Überprüfung neu erfassen.')
  }
 },[active,key,viewerId,goal.race_date,goal.race_name,goal.race_start_time])
 const persist=(next:RaceMarks,nextStart=startTime)=>{
  if(!loaded||!viewerId){setError('Bitte zuerst anmelden und Rennplan laden.');return false}
  try{
   const values=sanitizeRaceMarks(next,model.plan.checkpoints)
   localStorage.setItem(key,JSON.stringify({version:1,raceDate:goal.race_date,
    raceName:goal.race_name,startTime:nextStart,marks:values}))
   setMarks(values);setStartTime(nextStart);setError('')
   return true
  }catch{
   setError('Auf diesem Gerät konnte nicht gespeichert werden. Bitte Browser-Speicher prüfen.')
   return false
  }
 }
 const capture=(index:number,kind:'arrival'|'departure',manual=false)=>{
  if(model.status!=='ready')return
  const elapsed=manual?parseRaceElapsed(editValue):
   raceElapsedNow({raceDate:goal.race_date,startTime:clockOK(startTime)?startTime:null})
  if(elapsed===null){setError(manual?'Bitte Zeit ab Start als HH:MM eingeben (z. B. 02:15).':
   '„Jetzt“ funktioniert nur mit bestätigter Startuhrzeit während des Rennens. Zeit manuell eintragen oder Startzeit korrigieren.')
   return}
  const update=recordRaceMark(model.marks,model.plan.checkpoints,index,kind,elapsed)
  if(!update.ok){setError(update.reason||'Eintrag ungültig.');return}
  if(persist(update.marks)){
   setStatus('Abschnitt '+index+' · '+(kind==='arrival'?'Ankunft':'Weiterlauf')+
    ' nach '+formatRaceElapsed(elapsed)+' ab Start auf diesem Gerät gespeichert.')
   setEditValue('')
  }
 }
 const undo=()=>{
  const update=undoLastRaceMark(model.marks,model.plan.checkpoints)
  if(!update.ok){setError(update.reason||'Kein Eintrag vorhanden.');return}
  if(window.confirm('Letzte erfasste Zwischenzeit auf diesem Gerät zurücknehmen?')&&
   persist(update.marks))setStatus('Letzte Zwischenzeit zurückgenommen.')
 }
 const reset=()=>{
  if(!window.confirm('Alle selbst erfassten Renn-Zwischenzeiten für dieses Event auf diesem Gerät löschen?'))return
  if(persist({})){setStatus('Renn-Zwischenzeiten auf diesem Gerät zurückgesetzt.');setBackupOpen(false)}
 }
 const saveStart=()=>{
  const raw=startInput.trim()
  if(!clockOK(raw)){setError('Startuhrzeit als HH:MM im 24-Stunden-Format eingeben.');return}
  if(raw!==startTime&&model.recorded>0&&!window.confirm(
   'Die Startuhrzeit ändern? Bereits erfasste Zeiten seit Start bleiben unverändert.'))return
  if(persist(model.marks,raw))setStatus('Startuhrzeit '+raw+' für dieses Rennen lokal hinterlegt.')
 }
 const exportText=raceDayLogText({goal,model,startTime:clockOK(startTime)?startTime:null})
 const copy=async()=>{
  try{await navigator.clipboard.writeText(exportText)
   setStatus('Rennprotokoll kopiert. Du kannst es als Nachricht oder Notiz sichern.')
  }catch{setBackupOpen(true);setError('Kopieren ist hier blockiert. Protokoll unten öffnen und manuell kopieren.')}
 }
 if(!active||model.status!=='ready')return null
 const {rows,next,lastAction,latest,finished,buffer,plan}=model
 const nextGel=(fuelSchedule||[]).filter(g=>g.minute>=
  (lastAction?.actualMinutes??0)).slice(0,3)
 const canNow=clockOK(startTime)&&Boolean(viewerId)&&loaded
 const recentPause=latest&&!latest.finish&&latest.departure===null?latest:null
 const manualPoint=rows.find(r=>r.index===editIndex)
 const planBuffer=plan.target?.remaining??null
 return <section className="rdc-root" aria-label="Race Day Cockpit mit manuell erfassten Zwischenzeiten">
  <header className="rdc-head">
   <div><span className="rdc-kicker"><Icon name="flag"/> RACE PREP / RACE DAY COCKPIT</span>
    <h2>{goal.race_name} · {fmt(input.distanceKm)} km</h2>
    <p>Runden, Stopps und Zeitpuffer live nach <strong>deiner Eingabe</strong> – ohne Garmin-Livetracking.</p></div>
   <span className="rdc-mode">{finished?'Ziel erfasst':model.recorded>0?'Rennlog aktiv':'Vor dem Start'}</span>
  </header>
  <div className="rdc-metrics">
   <div><span>GEPLANT</span><strong>{formatRaceElapsed(plan.estimate!.totalMinutes)}</strong>
    <small>{rows.length} Abschnitte</small></div>
   <div><span>DEIN LIMIT</span><strong>{model.targetMinutes===null?'–':formatRaceElapsed(model.targetMinutes)}</strong>
    <small>{planBuffer===null?'Kein Zeitlimit':planBuffer>=0?planBuffer+' Min. Startpuffer':'Plan über Limit'}</small></div>
   <div><span>JETZT · NACH EINTRAG</span><strong>{lastAction?
    formatRaceElapsed(lastAction.actualMinutes):'–'}</strong>
    <small>{lastAction?'Ab Start, zuletzt erfasst':'Noch kein Ist-Wert'}</small></div>
   <div className={buffer===null?'rdc-buffer':buffer<0?'rdc-buffer is-behind':'rdc-buffer is-ahead'}>
    <span>RECHNERISCHER RESTPUFFER</span>
    <strong>{buffer===null?'–':(buffer>=0?'+':'−')+Math.abs(buffer)+' Min.'}</strong>
    <small>{buffer===null?'Erst nach erstem Eintrag':buffer>=0?
     'Restplan würde ins Limit passen':'Restplan würde Zeitlimit überschreiten'}</small>
   </div>
  </div>
  {buffer!==null&&<p className="rdc-precision">Puffer = Zielzeit minus bereits erfasste Zeit minus
   verbleibende <em>geplante</em> Zeit. Keine Prognose deiner tatsächlichen Zielzeit.</p>}
  {!saved&&<p className="rdc-warning">Die Rennstrategie ist noch nicht gespeichert.
   Zeitvergleiche verwenden die aktuelle Vorschau; Änderungen können die Sollzeiten verschieben.</p>}
  <div className="rdc-context">
   <div className="rdc-start">
    <label>Bestätigte Startuhrzeit · Fulda (HH:MM)
     <input aria-label="Startuhrzeit" value={startInput} maxLength={5}
      inputMode="numeric" placeholder="z. B. 06:00"
      onChange={e=>setStartInput(e.target.value)}/></label>
    <button type="button" onClick={saveStart}>Startzeit übernehmen</button>
   </div>
   {feelsLike&&<span className="rdc-weather"><Icon name="cloud-sun"/>
    Wetterprognose gefühlt {feelsLike[0]} bis {feelsLike[1]} °C · keine Messwerte</span>}
  </div>
  {error&&<p role="alert" className="rdc-error">{error}</p>}
  {status&&<p role="status" className="rdc-status">{status}</p>}
  <div className="rdc-next">
   <div className="rdc-next-text">
    <small>{finished?'ZIEL':'NÄCHSTER KONTROLLPUNKT'}</small>
    <strong>{finished?'Zielankunft eingetragen':next?
     'Abschnitt '+next.index+' · '+fmt(next.distanceKm)+' km':'Keine weitere Runde'}</strong>
    <p>{finished?'Die finale Zeit stammt aus deiner Eingabe.':
     next?'Soll-Ankunft +'+formatRaceElapsed(next.arrivalMinutes)+
     (next.plannedClock?' · '+next.plannedClock+' Uhr':'')+
     ' · geplante Laufzeit '+fmt(next.moveMinutes)+' Min.':
     'Die nächste Runde ist noch nicht verfügbar.'}</p>
   </div>
   <div className="rdc-next-actions">
    {recentPause&&<button type="button" className="rdc-depart" disabled={!canNow}
     onClick={()=>capture(recentPause.index,'departure')}>
     <Icon name="play"/> Weiter jetzt · Abschnitt {recentPause.index}</button>}
    {next&&!finished&&<button type="button" className="rdc-arrive"
     disabled={!canNow} onClick={()=>capture(next.index,'arrival')}>
     <Icon name="map-pin"/> Ankunft jetzt erfassen</button>}
   </div>
  </div>
  {!canNow&&<p className="rdc-tip">Für „Jetzt erfassen“ muss eine Startuhrzeit hinterlegt sein.
   Die Zeit wird erst beim Antippen berechnet. Manuelle Zeiten sind jederzeit möglich.</p>}
  <details className="rdc-manual">
   <summary><Icon name="pencil"/> Zwischenzeit manuell eintragen oder korrigieren</summary>
   <div className="rdc-manual-row">
    <label>Abschnitt<select value={editIndex} onChange={e=>{setEditIndex(Number(e.target.value));setEditValue('')}}>
     {rows.map(r=><option key={r.index} value={r.index}>
      {r.index} · {fmt(r.distanceKm)} km{r.finish?' · Ziel':''}</option>)}
    </select></label>
    <label>Zeitpunkt<select value={editKind} onChange={e=>{setEditKind(e.target.value as 'arrival'|'departure');setEditValue('')}}>
     <option value="arrival">Ankunft</option>
     {!manualPoint?.finish&&<option value="departure">Weiterlauf</option>}
    </select></label>
    <label>Zeit seit Start (HH:MM)<input type="text" inputMode="numeric" maxLength={5}
     placeholder={manualPoint?.arrival!==null?formatRaceElapsed(manualPoint!.arrival):'00:42'}
     value={editValue} onChange={e=>setEditValue(e.target.value)}/></label>
    <button type="button" onClick={()=>capture(editIndex,editKind,true)}>
     <Icon name="check"/> Zeit speichern</button>
   </div>
   <p>Beispiel: <strong>02:15</strong> bedeutet 2 Stunden 15 Minuten nach dem Start,
    keine Uhrzeit. Bereits erfasste Werte dürfen korrigiert werden. Zeitliche
    Widersprüche und übersprungene Ankünfte werden abgewiesen.</p>
  </details>
  <div className="rdc-fuel">
   <header><strong><Icon name="droplets"/> Verpflegung nach deinem Rennplan</strong>
    <small>Nur Sollwerte, keine behauptete Einnahme</small></header>
   <div className="rdc-fuel-targets">
    {input.carbsGPerHour!==null&&<span>{fmt(input.carbsGPerHour)} g KH/h</span>}
    {input.fluidMlPerHour!==null&&<span>{fmt(input.fluidMlPerHour)} ml/h</span>}
    {input.sodiumMgPerHour!==null&&<span>{fmt(input.sodiumMgPerHour)} mg Na/h</span>}
   </div>
   {fuelSchedule===null?<p>Gel-Plan wird aus deinem Vorrat geladen.</p>:
    fuelSchedule.length===0?<p>Keine Gels aus deinem Vorrat im Plan. Unter „Gel Buddy“
     Vorrat, Prioritäten und Getränkekohlenhydrate prüfen.</p>:
    nextGel.length>0?<div className="rdc-gels">
     {nextGel.map(g=><div key={g.minute+'-'+g.id}>
      <span>+{formatRaceElapsed(g.minute)}{clockOK(startTime)?
       ' · '+clockAt(startTime,g.minute)+' Uhr':''}</span>
      <strong>{fuelName(g)}</strong><small>{fmt(g.carbsG)} g KH geplant</small>
     </div>)}
    </div>:<p>Im bestehenden Gel-Plan sind keine späteren Portionen mehr vorgesehen.
     Das bedeutet nicht, dass bereits Gels eingenommen wurden.</p>}
  </div>
  <details className="rdc-timeline">
   <summary><Icon name="list"/> Alle {rows.length} Abschnitte, Pausen und Soll-/Ist-Zeiten</summary>
   <div className="rdc-scroll"><table>
    <thead><tr><th>Runde</th><th>km</th><th>Ankunft Soll</th>
     <th>Ankunft Ist</th><th>Weiter Soll</th><th>Weiter Ist</th><th>Abweichung</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.index} className={r.arrival!==null?'is-recorded':''}>
     <td>{r.index}{r.finish?' · Ziel':''}</td><td>{fmt(r.distanceKm)}</td>
     <td>+{formatRaceElapsed(r.arrivalMinutes)}</td>
     <td>{r.arrival===null?'–':'+'+formatRaceElapsed(r.arrival)}</td>
     <td>{r.finish?'–':'+'+formatRaceElapsed(r.departureMinutes)}
      {r.longBreakMinutes>0?' · langer Stopp':''}</td>
     <td>{r.departure===null?'–':'+'+formatRaceElapsed(r.departure)}</td>
     <td>{r.arrivalDelta===null?'–':signed(r.arrivalDelta)}</td>
    </tr>)}</tbody>
   </table></div>
  </details>
  <div className="rdc-footer">
   <div><strong><Icon name="shield-check"/> Offline auf diesem Gerät</strong>
    <p>Die Zwischenzeiten werden nur in diesem Browser gespeichert, nicht in Garmin
     und noch nicht zwischen Geräten synchronisiert. Vor einem Geräte- oder Browserwechsel
     das Protokoll kopieren. Bei gelöschten Browserdaten können Einträge verloren gehen.</p></div>
   <div className="rdc-footer-actions">
    <button type="button" onClick={()=>void copy()}><Icon name="copy"/> Rennprotokoll kopieren</button>
    <button type="button" onClick={()=>setBackupOpen(x=>!x)}>
     {backupOpen?'Protokoll ausblenden':'Protokoll anzeigen'}</button>
    <button type="button" disabled={!model.recorded} onClick={undo}>Letzten Eintrag rückgängig</button>
    <button type="button" disabled={!model.recorded} onClick={reset}>Rennlog zurücksetzen</button>
   </div>
   {backupOpen&&<textarea readOnly aria-label="Kopierbares Rennprotokoll"
    className="rdc-backup" value={exportText} rows={10}/>}
  </div>
 </section>
}
