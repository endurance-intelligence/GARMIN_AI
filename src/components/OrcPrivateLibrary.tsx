import {useEffect,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {readOrcZip,encodeOrcImage} from '../lib/orcZip.mjs'
import type {OrcSourceEntry} from '../lib/orcZip.mjs'
import type {TrainerWorkout} from '../lib/workoutLibrary'
import {formatPace} from '../lib/workoutLibrary'
import {split200Text} from '../lib/workoutSplitNotes'
type Source={id:string;title:string;source_number:number;review_required:boolean}
type Detail={entry:OrcSourceEntry;image_base64:string;image_content_type:string}
async function request<T>(body:Record<string,unknown>):Promise<T>{
 if(!garminSupabase)throw Error('Bitte anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const r=await fetch(garminSupabaseUrl+'/functions/v1/garmin-workout-archive',{method:'POST',cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)})
 const result=await r.json().catch(()=>({}))
 if(!r.ok)throw Error(result.error||'Import nicht verfügbar (HTTP '+r.status+').')
 return result
}
export function OrcPrivateLibrary({onReview,disabled}:{onReview:(workout:TrainerWorkout,hash:string)=>void;disabled:boolean}){
 const [sources,setSources]=useState<Source[]>([])
 const [detail,setDetail]=useState<Detail|null>(null)
 const [group,setGroup]=useState(0)
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 const [error,setError]=useState('')
 const [filter,setFilter]=useState('')
 const [showPhoto,setShowPhoto]=useState(false)
 const lock=useRef(false)
 const detailSeq=useRef(0)
 async function refresh(){
  try{const data=await request<{sources:Source[]}>({action:'orc_sources'});setSources(data.sources)}catch(e){setError(e instanceof Error?e.message:'Bibliothek nicht geladen.')}
 }
 useEffect(()=>{void refresh()},[])
 async function importZip(file:File){
  if(lock.current||disabled)return
  lock.current=true;setBusy(true);setError('');setStatus('Prüfe alle Trainings und Originalbilder …')
  try{
   const {manifest,rows}=await readOrcZip(file)
   if(rows.length!==27&& !window.confirm(rows.length+' unabhängige Vorlagen importieren?')){setStatus('Import abgebrochen.');return}
   for(let i=0;i<rows.length;i++){
    const entry=manifest.entries[i],row=rows[i]
    if(entry.id!==row.archiveRow.id)throw Error('Vorlagen-ID stimmt nicht überein.')
    const result=await request<{saved:boolean;id:string}>({action:'orc_import',entry,image:encodeOrcImage(row.image.bytes)})
    if(!result.saved||result.id!==entry.id)throw Error('Import nicht bestätigt.')
    setStatus((i+1)+' / '+rows.length+' Vorlagen einschließlich Originalbild gespeichert')
   }
   setStatus(rows.length+' Vorlagen gespeichert. Keine automatische Trainingsfreigabe.')
  }catch(e){setError((e instanceof Error?e.message:'Import fehlgeschlagen')+' Bereits gespeicherte Vorlagen bleiben erhalten. Dasselbe Paket kann erneut importiert werden.')}
  finally{lock.current=false;setBusy(false);await refresh()}
 }
 async function select(id:string){
  const seq=++detailSeq.current;setError('');setDetail(null);setShowPhoto(false);setGroup(0)
  try{const result=await request<Detail>({action:'orc_source_detail',id});if(seq===detailSeq.current)setDetail(result)}catch(e){if(seq===detailSeq.current)setError(e instanceof Error?e.message:'Original nicht geladen.')}
 }
 const chosen=detail?.entry.workout.groups[group]
 return <section className="wa-orc-library" aria-label="Private ORC-Originalbibliothek">
  <div className="wa-list-header"><strong>ORC-Originalbibliothek</strong><span>{sources.length} Originale</span></div>
  <p className="wa-hint">ZIP-Paket einmal vollständig prüfen und importieren. Jede Grafik bleibt eine eigene Vorlage. Originale und offene Prüfpunkte bleiben privat erhalten.</p>
  <label className="wa-import-label wa-import-free">{busy?'Import läuft …':'ORC-ZIP importieren'}<input type="file" accept=".zip,application/zip" disabled={busy||disabled} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(f)void importZip(f)}}/></label>
  {status&&<p role="status" className="wa-success">{status}</p>}
  {error&&<p role="alert" className="wa-error">{error}</p>}
  {sources.length>0&&<label className="wa-search">ORC-Vorlage suchen<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Trainingstitel"/></label>}
  <div className="wa-orc-list">{sources.filter(s=>s.title.toLocaleLowerCase('de-DE').includes(filter.toLocaleLowerCase('de-DE'))).map(s=><button type="button" key={s.id} onClick={()=>void select(s.id)}>{s.title}{s.review_required&&<small>Prüfung offen</small>}</button>)}</div>
  {detail&&chosen&&<div className="wa-orc-detail">
   <button type="button" onClick={()=>{detailSeq.current++;setDetail(null)}}>Details schließen</button>
   <h4>{detail.entry.workout.title}</h4>
   <p>{detail.entry.reviewRequired?'Prüfung erforderlich – noch nicht für automatische Planung freigegeben.':'Originalvorlage – vor Übernahme individuell prüfen.'}</p>
   <p>{detail.entry.sourceNotes}</p>
   <button type="button" onClick={()=>setShowPhoto(v=>!v)}>{showPhoto?'Originalbild ausblenden':'Originalbild anzeigen'}</button>
   {showPhoto&&<img alt="Originale ORC-Trainingsgrafik" src={'data:'+detail.image_content_type+';base64,'+detail.image_base64}/>}
   <label>Gruppe<select value={group} onChange={e=>setGroup(Number(e.target.value))}>{detail.entry.workout.groups.map((g,i)=><option key={i} value={i}>{g.name}</option>)}</select></label>
   <p>Einlaufen: {detail.entry.workout.warmup.distanceMeters??'–'} m · {detail.entry.workout.warmup.notes}</p>
   <p>{chosen.notes}</p>
   <ol>{chosen.steps.map((s,i)=><li key={i}>{s.kind==='run'?'Belastung':s.kind==='recovery'?'Pause':s.kind} · {s.distanceMeters===null?'':s.distanceMeters+' m'} {s.durationSeconds===null?'':s.durationSeconds+' s'} {s.paceSecondsPerKm===null?'':formatPace(s.paceSecondsPerKm)+'/km'}<small>{s.notes}{split200Text(s)?' · '+split200Text(s):''}</small></li>)}</ol>
   <p>Auslaufen: {detail.entry.workout.cooldown.notes}</p>
   <button type="button" disabled={disabled||busy} onClick={()=>onReview(structuredClone(detail.entry.workout),detail.entry.sourceImageSha256)}>Als neue Vorlage prüfen</button>
  </div>}
 </section>
}
