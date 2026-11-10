import {useEffect,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {
 blankStep,blankTrainerWorkout,formatPace,parsePace,previousOrcFlyer,workoutSummary
} from '../lib/workoutLibrary'
import type {ArchiveRecord,TrainerWorkout,TrainerGroup,TrainerStep,WorkoutStepKind} from '../lib/workoutLibrary'
import {readTrainerPhotoLocally} from '../lib/localTrainerPhotoOcr'
import {interpretLocalPhotoText,isKnownOrcOriginal} from '../lib/localPhotoWorkout'
import '../styles/workout-archive.css'

type ArchiveResponse={entries:ArchiveRecord[];hasMore:boolean;nextPage:number|null;visionConfigured:boolean}
type SourceKind='trainer_photo'|'manual'|'orc_reference'
const endpoint=garminSupabaseUrl+'/functions/v1/garmin-workout-archive'
function todayBerlin(){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date())
 const v=(type:string)=>parts.find(p=>p.type===type)?.value||''
 return [v('year'),v('month'),v('day')].join('-')
}
async function callArchive<T>(body?:Record<string,unknown>,page=0):Promise<T>{
 if(!garminSupabase)throw Error('Bitte zuerst anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte zuerst anmelden.')
 const r=await fetch(endpoint+(body?'':'?page='+page),{method:body?'POST':'GET',cache:'no-store',
  headers:{
   authorization:'Bearer '+session.access_token,
   apikey:garminPublishableKey,
   ...(body?{'content-type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})})
 const json=await r.json().catch(()=>({})) as Record<string,unknown>
 if(!r.ok){
  if(json.code==='vision_not_configured')
   throw Error('Die Fotoanalyse benötigt noch den privaten KI-Zugang.')
  if(json.code==='vision_needs_manual_review')
   throw Error('Die Trainingsgrafik konnte nicht sicher erkannt werden. Bitte die Vorlage manuell erfassen oder ein klareres Bild verwenden.')
  // Specific and safe status messages: never expose upstream request data.
  const visionErrors:Record<string,string>={
   invalid_image:'Das Fotoformat ist ungültig. Bitte JPG, PNG oder WebP wählen.',
   vision_credentials_rejected:'OpenAI hat den API-Key abgelehnt. Bitte den OPENAI_API_KEY in Supabase prüfen.',
   vision_quota_exceeded:'OpenAI meldet fehlendes API-Guthaben oder ein erreichtes Ausgaben- bzw. Nutzungslimit. Bitte Billing und Projektlimits in platform.openai.com prüfen.',
   vision_rate_limited:'OpenAI hat ein tatsächliches Anfragen- oder Token-Ratenlimit erreicht. Bitte nach der angezeigten Wartezeit erneut versuchen.',
   vision_429_unclear:'OpenAI meldet HTTP 429, ohne eindeutig zwischen Ratenlimit und API-Guthaben zu unterscheiden. Bitte zuerst Billing, Projektlimits und Rate Limits prüfen – nicht wiederholt versuchen.',
   vision_model_unavailable:'Das konfigurierte OpenAI-Modell ist für dieses Projekt nicht verfügbar.',
   vision_request_rejected:'OpenAI hat die Anfrage abgelehnt. Der Bildanalysedienst muss korrigiert werden.',
   vision_timeout:'Die KI-Bildanalyse hat zu lange gedauert. Bitte später erneut versuchen.',
   vision_output_truncated:'Die KI-Antwort war unvollständig. Bitte ein besser zugeschnittenes Bild probieren.',
   vision_incomplete:'Die KI hat keine vollständige Trainingsstruktur geliefert. Bitte das Foto prüfen.',
   vision_invalid_output:'Die KI hat ungültige Trainingsdaten zurückgegeben. Bitte das Foto prüfen.',
   vision_upstream_unavailable:'Der OpenAI-Bildanalysedienst ist derzeit nicht erreichbar.'
  }
  if(typeof json.code==='string'&&visionErrors[json.code])
   throw Error(visionErrors[json.code])
  throw Error(r.status===401?'Bitte neu anmelden.':
   typeof json.error==='string'?json.error:
   'Trainingsarchiv: Anfrage fehlgeschlagen (HTTP '+r.status+').')
 }
 return json as T
}
const integer=(value:string)=>value===''?null:Number(value)
function sessionLabel(s:TrainerStep){
 const quantity=s.distanceMeters? s.distanceMeters+' m':
  s.durationSeconds?Math.round(s.durationSeconds/60*10)/10+' min':'offen'
 return (s.kind==='run'?'Lauf':s.kind==='recovery'?'Trab':
  s.kind==='drill'?'Übung':s.kind==='warmup'?'Einlaufen':'Auslaufen')+
  ' · '+quantity+(s.paceSecondsPerKm?' · '+formatPace(s.paceSecondsPerKm)+'/km':'')
}
export function WorkoutArchivePanel({active,date,onPlanned}:{
 active:boolean;date:string;onPlanned:()=>void
}){
 const [open,setOpen]=useState(false)
 const [loading,setLoading]=useState(false)
 const [entries,setEntries]=useState<ArchiveRecord[]>([])
 const [configured,setConfigured]=useState(false)
 const [hasMore,setHasMore]=useState(false)
 const [nextPage,setNextPage]=useState<number|null>(null)
 const [search,setSearch]=useState('')
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [editing,setEditing]=useState<TrainerWorkout|null>(null)
 const [sourceKind,setSourceKind]=useState<SourceKind>('manual')
 const [imageHash,setImageHash]=useState<string|null>(null)
 const [editGroup,setEditGroup]=useState(0)
 const [busy,setBusy]=useState(false)
 const [localBusy,setLocalBusy]=useState(false)
 const [ocrProgress,setOcrProgress]=useState('')
 const [ocrRaw,setOcrRaw]=useState('')
 const [ocrWarnings,setOcrWarnings]=useState<string[]>([])
 const [ocrIdentifiedGroups,setOcrIdentifiedGroups]=useState(0)
 const [ocrWasTemplate,setOcrWasTemplate]=useState(false)
 const [localPhotoUrl,setLocalPhotoUrl]=useState<string|null>(null)
 const localPhotoUrlRef=useRef<string|null>(null)
 const [choice,setChoice]=useState<Record<string,string>>({})
 const [expanded,setExpanded]=useState<string|null>(null)
 const requestId=useRef<string>(crypto.randomUUID())
 const planIds=useRef<Map<string,string>>(new Map())
 useEffect(()=>()=>{if(localPhotoUrlRef.current)URL.revokeObjectURL(localPhotoUrlRef.current)},[])

 async function refresh(){
  setLoading(true);setError('')
  try{
   const result=await callArchive<ArchiveResponse>()
   setEntries(result.entries||[])
   setConfigured(result.visionConfigured===true)
   setHasMore(result.hasMore===true)
   setNextPage(result.nextPage??null)
  }catch(e){setError(e instanceof Error?e.message:'Archiv konnte nicht geladen werden.')}
  finally{setLoading(false)}
 }
 useEffect(()=>{
  if(!active||!open)return
  void refresh()
 },[active,open])

 async function loadMore(){
  if(nextPage===null||loading)return
  setLoading(true);setError('')
  try{
   const result=await callArchive<ArchiveResponse>(undefined,nextPage)
   setEntries(old=>[...old,...(result.entries||[]).filter(entry=>!old.some(p=>p.id===entry.id))])
   setHasMore(result.hasMore===true)
   setNextPage(result.nextPage??null)
  }catch(e){setError(e instanceof Error?e.message:'Weitere Vorlagen nicht geladen.')}
  finally{setLoading(false)}
 }
 const shown=entries.filter(record=>{
  const needle=search.trim().toLocaleLowerCase('de-DE')
  if(!needle)return true
  return [record.title,record.coach_name,record.source_label,
   ...record.workout.groups.map(g=>g.name)].some(text=>
    text.toLocaleLowerCase('de-DE').includes(needle))
 })

 async function localImageSelected(file:File|null){
  if(!file)return
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||
    file.size<1000||file.size>8_000_000){
   setError('Bitte JPG, PNG oder WebP unter 8 MB auswählen.')
   return
  }
  setLocalBusy(true);setOcrProgress('Lokale Texterkennung startet …')
  setOcrRaw('');setOcrWarnings([]);setError('');setSuccess('')
  try{
   const [text,hashBuffer]=await Promise.all([
    readTrainerPhotoLocally(file,(phase,value)=>{
     setOcrProgress(phase+(value>0?' · '+Math.round(value*100)+' %':''))
    }),
    crypto.subtle.digest('SHA-256',await file.arrayBuffer())
   ])
   const hash=Array.from(new Uint8Array(hashBuffer),n=>n.toString(16).padStart(2,'0')).join('')
   const interpreted=interpretLocalPhotoText(text)
   const knownTemplate=isKnownOrcOriginal(text)
   setOcrIdentifiedGroups(interpreted.detectedGroups)
   setOcrWasTemplate(knownTemplate)
   if(localPhotoUrlRef.current)URL.revokeObjectURL(localPhotoUrlRef.current)
   const url=URL.createObjectURL(file)
   localPhotoUrlRef.current=url
   setLocalPhotoUrl(url)
   setOcrRaw(interpreted.recognizedText)
   setImageHash(hash)
   if(knownTemplate){
    // The values come from our previously human-reviewed ORC original,
    // NOT from a claim that OCR has reconstructed all chart bars.
    begin(previousOrcFlyer(),'trainer_photo',hash)
    setOcrWarnings(['Bekannte ORC-Originalvorlage erkannt: Die Paces stammen aus unserer zuvor geprüften Trainer-Grafik – nicht aus der lokalen OCR.',
      'Bitte prüfen, ob dein Foto wirklich exakt dieselbe Einheit zeigt.',
      ...interpreted.warnings])
    setSuccess('Bekannte ORC-Vorlage in alle fünf Gruppen übernommen. Originalfoto und Werte vor dem Speichern kontrollieren.')
   }else if(interpreted.workout){
    begin(interpreted.workout,'trainer_photo',hash)
    setOcrWarnings(interpreted.warnings)
    setSuccess(interpreted.detectedGroups+' Gruppe(n) teilweise ausgelesen. Fehlende Werte und unerkannte Gruppen müssen vor dem Archivieren ergänzt werden.')
   }else{
    setEditing(null)
    setSourceKind('trainer_photo')
    setOcrWarnings([...interpreted.warnings,
      'Es wurden keine sicheren Intervalle zugeordnet. Wir öffnen deshalb keinen scheinbar ausgefüllten Entwurf.'])
    setError('Schrift erkannt, aber keine vollständige Intervallstruktur. Originaltext unten ansehen oder manuell anhand des Fotos ergänzen.')
   }
  }catch(e){
   setError(e instanceof Error?e.message:'Lokale Texterkennung fehlgeschlagen.')
  }finally{setLocalBusy(false);setOcrProgress('')}
 }
 function completeOcrManually(){
  const blank=blankTrainerWorkout()
  blank.title='Trainertraining – Angaben aus Foto ergänzen'
  blank.sourceLabel='ORC-Foto · kostenlose lokale OCR'
  blank.groups[0].name='Gruppe prüfen'
  blank.groups[0].steps[0].distanceMeters=null
  begin(blank,'trainer_photo',imageHash)
  setOcrWarnings(old=>[...old,'Alle Schritte müssen anhand des Fotos ergänzt werden.'])
 }
 function begin(workout:TrainerWorkout,kind:SourceKind,hash:string|null=null){
  setEditing(workout);setSourceKind(kind);setImageHash(hash)
  setEditGroup(0);setError('');setSuccess('')
  requestId.current=crypto.randomUUID()
 }
 function change(fn:(w:TrainerWorkout)=>void){
  setEditing(w=>{if(!w)return w;const next=structuredClone(w);fn(next);return next})
 }
 function changeStep(index:number,fn:(s:TrainerStep)=>TrainerStep){
  change(w=>{w.groups[editGroup].steps[index]=fn(w.groups[editGroup].steps[index])})
 }
 function changeGroup(fn:(group:TrainerGroup)=>void){
  change(w=>fn(w.groups[editGroup]))
 }
 async function imageSelected(file:File|null){
  if(!file)return
  if(!configured){setError('Die automatische Fotoanalyse ist noch nicht eingerichtet.');return}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||
     file.size>2_700_000||file.size<1500){
   setError('Bitte JPG, PNG oder WebP bis 2,7 MB auswählen.')
   return
  }
  setBusy(true);setError('');setSuccess('')
  try{
   const data=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>typeof reader.result==='string'?
     resolve(reader.result):reject(Error('Dateiformat nicht unterstützt'))
    reader.onerror=()=>reject(Error('Bild konnte nicht gelesen werden'))
    reader.readAsDataURL(file)
   })
   const result=await callArchive<{
    code:string;workout:TrainerWorkout;sourceImageSha256:string
   }>({action:'parse_photo',image:data})
   if(result.code!=='parsed'||!result.workout)throw Error('Foto nicht eindeutig erkannt')
   begin(result.workout,'trainer_photo',result.sourceImageSha256)
   setSuccess('Bild ausgelesen. Bitte jede Gruppe und jedes Intervall prüfen, bevor du speicherst.')
  }catch(e){setError(e instanceof Error?e.message:'Bildanalyse fehlgeschlagen')}
  finally{setBusy(false)}
 }
 async function save(){
  if(!editing||busy)return
  setBusy(true);setError('');setSuccess('')
  try{
   const result=await callArchive<{saved:boolean,id:string}>({
    action:'save',clientRequestId:requestId.current,reviewed:true,
    workout:editing,sourceKind,sourceImageSha256:imageHash
   })
   if(result.saved!==true)throw Error('Speichern nicht bestätigt.')
   setEditing(null)
   setOcrWarnings([]);setOcrRaw('');setOcrIdentifiedGroups(0);setOcrWasTemplate(false)
   if(localPhotoUrlRef.current)URL.revokeObjectURL(localPhotoUrlRef.current)
   localPhotoUrlRef.current=null;setLocalPhotoUrl(null)
   await refresh()
   setSuccess('Trainertraining im Archiv gespeichert. Alle Gruppen bleiben verfügbar.')
  }catch(e){setError(e instanceof Error?e.message:'Vorlage nicht gespeichert')}
  finally{setBusy(false)}
 }
 async function plan(template:ArchiveRecord,group:string){
  if(busy||date<todayBerlin())return
  setBusy(true);setError('');setSuccess('')
  try{
   const key=template.id+'|'+group+'|'+date
   let id=planIds.current.get(key)
   if(!id){id=crypto.randomUUID();planIds.current.set(key,id)}
   const response=await callArchive<{saved:boolean;created:boolean;id:string}>({
    action:'plan',templateId:template.id,group,date,clientRequestId:id
   })
   if(response.saved!==true)throw Error('Einplanen nicht bestätigt')
   setSuccess((response.created?'Als Entwurf eingetragen: ':'Bereits im Kalender: ')+
    template.title+' · '+group+'. Kein Garmin-Schreibzugriff.')
   onPlanned()
  }catch(e){setError(e instanceof Error?e.message:'Planung fehlgeschlagen')}
  finally{setBusy(false)}
 }

 return <details className="wa-root" open={open}
  onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="wa-toggle">
   <span className="wa-icon">↗</span>
   <span><strong>Trainingsbibliothek</strong>
    <small>Trainer-Foto importieren · für später archivieren · jederzeit wiederholen</small></span>
   <span className="wa-count">{open?(loading?'…':entries.length+' Vorlagen'):'Öffnen'}</span>
  </summary>
  {open&&<div className="wa-content">
   <div className="wa-header">
    <div>
     <h3>Echte Coach-Vorgaben. Dauerhaft verfügbar.</h3>
     <p>Jedes neue ORC-Bild kann eine andere Einheit enthalten. Die Bibliothek
      bewahrt alle Gruppen, Tempi, Pausen und Notizen des Trainers.</p>
    </div>
   </div>
   <div className="wa-import-actions">
    <label className="wa-import-label wa-import-free">
     {localBusy?'Lese Bild auf deinem Gerät …':'Foto kostenlos lokal lesen'}
     <input type="file" accept="image/jpeg,image/png,image/webp"
      disabled={busy||localBusy}
      onChange={e=>{const file=e.currentTarget.files?.[0]||null;
       e.currentTarget.value='';void localImageSelected(file)}}/>
    </label>
    <button type="button" disabled={busy||localBusy}
     onClick={()=>begin(blankTrainerWorkout(),'manual')}>Manuell erfassen</button>
    <button type="button" disabled={busy||localBusy}
     onClick={()=>begin(previousOrcFlyer(),'orc_reference')}>
     Letzte ORC-Grafik übernehmen
    </button>
   </div>
   {localBusy&&<p className="wa-ocr-progress" role="status">{ocrProgress}</p>}
   <p className="wa-hint">Kostenlose Texterkennung auf deinem Gerät – ohne API-Guthaben.
    Nur geprüfte Trainingsdaten und der Bild-Fingerabdruck werden im privaten
    Archiv gespeichert. Die benötigte OCR-Software wird beim ersten Import geladen.</p>
   {configured&&<details className="wa-paid-alternative">
    <summary>Optional: externe KI-Bildanalyse (kostenpflichtige API)</summary>
    <p>Diese Option sendet das Bild an OpenAI und benötigt verfügbares API-Guthaben.</p>
    <label className="wa-import-label">
     {busy?'Analysiere …':'Mit OpenAI analysieren'}
     <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||localBusy}
      onChange={e=>{const file=e.currentTarget.files?.[0]||null;
       e.currentTarget.value='';void imageSelected(file)}}/>
    </label>
   </details>}

   {localPhotoUrl&&ocrRaw&&<details className="wa-local-photo">
    <summary>Originalfoto zur Kontrolle einblenden</summary>
    <img src={localPhotoUrl} alt="Lokal ausgewähltes ORC-Trainerfoto zur Überprüfung der erkannten Daten"/>
   </details>}
   {ocrRaw&&<div className="wa-ocr-review" role="status">
    <strong>OCR-Auswertung · {ocrIdentifiedGroups} Gruppen aus Text erkannt{ocrWasTemplate?' · geprüfte Referenz übernommen':''}</strong>
    <ul>{ocrWarnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
    {!editing&&<button type="button" className="wa-manual-ocr" onClick={completeOcrManually}>
      Erkannten Text manuell ins Training übertragen
    </button>}
    <details><summary>Erkannten Originaltext ansehen</summary>
     <pre>{ocrRaw||'Kein Text erkannt.'}</pre>
    </details>
   </div>}
   {editing&&<div className="wa-editor">
    <div className="wa-editor-head">
     <h3>Trainertraining überprüfen</h3>
     <button type="button" onClick={()=>setEditing(null)} disabled={busy}>Abbrechen</button>
    </div>
    <div className="wa-fields">
     <label>Name der Einheit<input value={editing.title} maxLength={120}
      onChange={e=>change(w=>{w.title=e.target.value})} placeholder="z. B. Schwelle im Wechsel"/></label>
     <label>Trainer / Verein<input value={editing.trainer} maxLength={100}
      onChange={e=>change(w=>{w.trainer=e.target.value})} placeholder="z. B. ORC Runcrew"/></label>
     <label>Quelle / Veranstaltung<input value={editing.sourceLabel} maxLength={120}
      onChange={e=>change(w=>{w.sourceLabel=e.target.value})} placeholder="z. B. Track Tuesday"/></label>
    </div>
    <div className="wa-segment-fields">
     {(['warmup','cooldown'] as const).map(part=><div key={part}>
      <strong>{part==='warmup'?'Einlaufen':'Auslaufen'}</strong>
      <label>Distanz (m)<input inputMode="numeric" type="number" min={20} max={50000}
       value={editing[part].distanceMeters??''}
       onChange={e=>change(w=>{w[part].distanceMeters=integer(e.target.value)})}/></label>
      <label>Sekunden<input type="number" inputMode="numeric" min={20} max={36000}
       value={editing[part].durationSeconds??''}
       onChange={e=>change(w=>{w[part].durationSeconds=integer(e.target.value)})}/></label>
      <label>Hinweise<input value={editing[part].notes} maxLength={250}
       onChange={e=>change(w=>{w[part].notes=e.target.value})}/></label>
     </div>)}
    </div>
    <div className="wa-group-tabs" role="group" aria-label="Trainingsgruppe auswählen">
     {editing.groups.map((g,i)=><button type="button" key={i} aria-pressed={i===editGroup}
      className={i===editGroup?'selected':''} onClick={()=>setEditGroup(i)}>
      {g.name||'Gruppe '+(i+1)}</button>)}
     {editing.groups.length<12&&<button type="button"
      onClick={()=>{change(w=>{w.groups.push({name:'Gruppe '+(w.groups.length+1),
       notes:'',steps:[blankStep()]})});setEditGroup(editing.groups.length)}}>
      + Gruppe</button>}
    </div>
    {editing.groups[editGroup]&&<>
     <div className="wa-group-meta">
      <label>Gruppenname<input maxLength={50} value={editing.groups[editGroup].name}
       onChange={e=>changeGroup(g=>{g.name=e.target.value})}/></label>
      <label>Trainerhinweise<input maxLength={350} value={editing.groups[editGroup].notes}
       onChange={e=>changeGroup(g=>{g.notes=e.target.value})}/></label>
     </div>
     <div className="wa-editor-steps">
      {editing.groups[editGroup].steps.map((step,i)=><div className="wa-step" key={i}>
       <div className="wa-step-top">
        <strong>Schritt {i+1}</strong>
        <button type="button" disabled={editing.groups[editGroup].steps.length<=1}
         onClick={()=>changeGroup(g=>{g.steps.splice(i,1)})}>Entfernen</button>
       </div>
       <div className="wa-step-fields">
        <label>Art<select value={step.kind}
         onChange={e=>changeStep(i,s=>({...s,kind:e.target.value as WorkoutStepKind}))}>
         <option value="run">Laufen</option><option value="recovery">Trabpause</option>
         <option value="drill">Übung</option><option value="warmup">Einlaufen</option>
         <option value="cooldown">Auslaufen</option>
        </select></label>
        <label>Meter<input type="number" inputMode="numeric" min={20} max={50000}
         value={step.distanceMeters??''} onChange={e=>changeStep(i,s=>({
          ...s,distanceMeters:integer(e.target.value)}))}/></label>
        <label>Tempo/km<input key={editGroup+'-'+i} type="text"
         inputMode="text" placeholder="4:20" defaultValue={formatPace(step.paceSecondsPerKm)}
         maxLength={5} onBlur={e=>changeStep(i,s=>({...s,
          paceSecondsPerKm:parsePace(e.target.value)}))}/></label>
        <label>Sekunden<input type="number" inputMode="numeric" min={10} max={14400}
         value={step.durationSeconds??''} onChange={e=>changeStep(i,s=>({
          ...s,durationSeconds:integer(e.target.value)}))}/></label>
        <label>Notiz<input value={step.notes} maxLength={180}
         onChange={e=>changeStep(i,s=>({...s,notes:e.target.value}))}/></label>
       </div>
      </div>)}
     </div>
     <div className="wa-add-step">
      <button type="button" onClick={()=>changeGroup(g=>{g.steps.push(blankStep('run'))})}>
       + Belastung</button>
      <button type="button" onClick={()=>changeGroup(g=>{g.steps.push(blankStep('recovery'))})}>
       + Pause</button>
      {editing.groups.length>1&&<button type="button"
       onClick={()=>{change(w=>{w.groups.splice(editGroup,1)});
        setEditGroup(Math.max(0,editGroup-1))}}>Gruppe entfernen</button>}
     </div>
    </>}
    <div className="wa-editor-footer">
     <p>Bitte alle erkannten Gruppen und Paces kontrollieren.
      Eine gespeicherte Version bleibt unverändert; Korrekturen werden als neue Version archiviert.</p>
     <button type="button" disabled={busy} onClick={()=>void save()}>
      {busy?'Speichere …':'Geprüfte Vorlage archivieren'}
     </button>
    </div>
   </div>}

   <div className="wa-list-header">
    <strong>Dein Trainingsarchiv</strong>
    <span>{entries.length} geladene Vorlagen</span>
   </div>
   <label className="wa-search">Archiv durchsuchen
    <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Name, Gruppe, Trainer …" maxLength={100}/>
   </label>
   {!loading&&entries.length===0&&<p className="wa-hint">
    Noch keine gespeicherte Vorlage. Übernimm die vorherige ORC-Einheit oder erfasse ein neues Trainertraining.
   </p>}
   <div className="wa-list">
    {shown.map(record=>{
     const group=choice[record.id]||
      record.workout.groups[0]?.name||''
     const selected=record.workout.groups.find(g=>g.name===group)
     const overview=selected?workoutSummary(selected):null
     return <article className="wa-record" key={record.id}>
      <div className="wa-record-head">
       <div><strong>{record.title}</strong><small>{record.coach_name||'Trainer nicht angegeben'}
        {record.source_label?' · '+record.source_label:''}</small></div>
       <span>{record.workout.groups.length} {record.workout.groups.length===1?'Gruppe':'Gruppen'}</span>
      </div>
      <div className="wa-record-controls">
       <label>Gruppe<select value={group} onChange={e=>setChoice(prev=>({...prev,[record.id]:e.target.value}))}>
        {record.workout.groups.map(g=><option value={g.name} key={g.name}>{g.name}</option>)}
       </select></label>
       <span>{overview?.intervals||0} Belastungen
        {overview?.distanceMeters?' · '+(overview.distanceMeters/1000).toLocaleString('de-DE')+' km':''}</span>
      </div>
      <div className="wa-record-actions">
       <button type="button" onClick={()=>setExpanded(expanded===record.id?null:record.id)}>
        {expanded===record.id?'Ablauf schließen':'Training ansehen'}</button>
       <button type="button" onClick={()=>begin(structuredClone(record.workout),'manual')} disabled={busy}>
        Als neue Version bearbeiten</button>
       <button type="button" className="wa-plan-button" disabled={busy||date<todayBerlin()||!selected}
        onClick={()=>void plan(record,group)}>Für {date.split('-').reverse().join('.')} vormerken</button>
      </div>
      {expanded===record.id&&selected&&<div className="wa-record-details">
       <p><strong>Einlaufen:</strong> {record.workout.warmup.distanceMeters?
        record.workout.warmup.distanceMeters+' m · ':''}{record.workout.warmup.notes||'offen'}</p>
       <div className="wa-step-chips">{selected.steps.map((s,i)=>
        <span key={i} className={'wa-chip '+(s.kind==='run'?'wa-chip-run':'')}>
         {sessionLabel(s)}</span>)}</div>
       <p><strong>Auslaufen:</strong> {record.workout.cooldown.notes||'offen'}</p>
       {selected.notes&&<p>{selected.notes}</p>}
      </div>}
     </article>
    })}
   </div>
   {!loading&&shown.length===0&&entries.length>0&&<p className="wa-hint">Keine passende Vorlage unter den geladenen Trainings.</p>}
   {hasMore&&<button type="button" className="wa-load-more" disabled={loading}
    onClick={()=>void loadMore()}>{loading?'Lade …':'Weitere 100 Vorlagen laden'}</button>}
   {success&&<p className="wa-success" role="status">{success}</p>}
   {error&&<p className="wa-error" role="alert">{error}</p>}
   <p className="wa-hint">Einplanen erstellt nur einen privaten Entwurf. Garmin-Workout-Erstellung
    und automatische Coach-Auswahl bleiben bis zur separaten Prüfung deaktiviert.</p>
  </div>}
 </details>
}
