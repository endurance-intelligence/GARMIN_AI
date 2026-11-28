import {useEffect,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {readOrcZip,encodeOrcImage} from '../lib/orcZip.mjs'
import type {OrcSourceEntry} from '../lib/orcZip.mjs'
import type {TrainerWorkout,ArchiveRecord} from '../lib/workoutLibrary'
import {formatPace} from '../lib/workoutLibrary'
import {numberedStepComments,isDrinkBreak} from '../lib/workoutSplitNotes'
import {unifiedLibraryItems,libraryItemMatches} from '../lib/unifiedWorkoutLibrary.mjs'
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
export function OrcPrivateLibrary({onReview,disabled,date,entries,loading,hasMore,onLoadMore,onSelectRecord}:{onReview:(workout:TrainerWorkout,hash:string,groupIndex:number,reviewRequired:boolean,sourceNotes:string,photo:string)=>void;disabled:boolean;date:string;entries:ArchiveRecord[];loading:boolean;hasMore:boolean;onLoadMore:()=>void;onSelectRecord:(record:ArchiveRecord)=>void}){
 const [sources,setSources]=useState<Source[]>([])
 const [sourcesReady,setSourcesReady]=useState(false)
 const [detail,setDetail]=useState<Detail|null>(null)
 const [group,setGroup]=useState(0)
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 const [error,setError]=useState('')
 const [filter,setFilter]=useState('')
 const [showPhoto,setShowPhoto]=useState(false)
 const [detailLoading,setDetailLoading]=useState(false)
 const detailRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(detail)detailRef.current?.scrollIntoView({block:'nearest'})},[detail])
 const lock=useRef(false)
 const detailSeq=useRef(0)
 async function refresh(){
  try{const data=await request<{sources:Source[]}>({action:'orc_sources'});setSources(data.sources);setSourcesReady(true)}catch(e){setError(e instanceof Error?e.message:'Bibliothek nicht geladen.')}
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
  const seq=++detailSeq.current;setError('');setDetail(null);setShowPhoto(false);setGroup(0);setDetailLoading(true)
  try{const result=await request<Detail>({action:'orc_source_detail',id});if(seq===detailSeq.current){setGroup(Math.max(0,result.entry.workout.groups.findIndex(g=>g.name==='Wolf')));setDetail(result)}}catch(e){if(seq===detailSeq.current)setError(e instanceof Error?e.message:'Original nicht geladen.')}finally{if(seq===detailSeq.current)setDetailLoading(false)}
 }
 const items=unifiedLibraryItems(sources,entries)
 const current=detail?items.find(item=>item.source?.id===detail.entry.id):undefined
 const chosen=detail?.entry.workout.groups[group]
 const comments=numberedStepComments(chosen?.steps||[])
 return <section className="wa-orc-library" aria-label="Private ORC-Originalbibliothek">
  <div className="wa-list-header"><strong>Alle Trainings</strong><span>{sourcesReady&&!loading?items.length+' Vorlagen':'Lade …'}</span></div>
  <details className="wa-zip-management"><summary>ZIP-Import verwalten</summary>
  <p className="wa-hint">Originale bleiben unverändert. Ein erneuter Import erzeugt keine Duplikate.</p>
  <label className="wa-import-label wa-import-free">{busy?'Import läuft …':'ORC-ZIP importieren'}<input type="file" accept=".zip,application/zip" disabled={busy||disabled} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(f)void importZip(f)}}/></label>
  </details>
  {status&&<p role="status" className="wa-success">{status}</p>}
  {error&&<p role="alert" className="wa-error">{error}</p>}
  {!detail&&<label className="wa-search">Bibliothek durchsuchen<input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Name, Gruppe, Trainer …"/></label>}
  {detailLoading&&<p role="status">Training wird geladen …</p>}
  {!detail&&<div className="wa-orc-list">{items.filter(item=>libraryItemMatches(item,filter)).map(item=>item.source?
   <button type="button" key={item.key} disabled={busy||disabled||detailLoading} onClick={()=>void select(item.source!.id)}><span>{item.source.title}</span><small>{item.source.review_required?'Prüfung offen':'Auswählen ›'}</small></button>:
   <button type="button" key={item.key} disabled={busy||disabled||detailLoading} onClick={()=>onSelectRecord(item.versions[0])}><span>{item.versions[0].title}</span><small>Geprüft ›</small></button>
  )}</div>}
  {!detail&&!loading&&sourcesReady&&items.filter(item=>libraryItemMatches(item,filter)).length===0&&<p className="wa-hint">Keine passende Vorlage in der Bibliothek.</p>}
  {!detail&&hasMore&&<button type="button" className="wa-load-more" disabled={loading||busy} onClick={onLoadMore}>{loading?'Lade …':'Weitere 100 Vorlagen laden'}</button>}
  {detail&&chosen&&<div className="wa-orc-detail" ref={detailRef}>
   <button type="button" onClick={()=>{detailSeq.current++;setDetail(null)}}>‹ Zurück zur Trainingsauswahl</button>
   <h4>{detail.entry.workout.title}</h4>
   <p>{detail.entry.reviewRequired?'Prüfung erforderlich – noch nicht für automatische Planung freigegeben.':'Originalvorlage – Gruppe auswählen und für den Kalendertag übernehmen.'}</p>
   <p>{detail.entry.sourceNotes}</p>
   <button type="button" onClick={()=>setShowPhoto(v=>!v)}>{showPhoto?'Originalbild ausblenden':'Originalbild anzeigen'}</button>
   {showPhoto&&<img alt="Originale ORC-Trainingsgrafik" src={'data:'+detail.image_content_type+';base64,'+detail.image_base64}/>}
   <label>Gruppe<select value={group} onChange={e=>setGroup(Number(e.target.value))}>{detail.entry.workout.groups.map((g,i)=><option key={i} value={i}>{g.name}</option>)}</select></label>
   <button type="button" className="wa-library-select" disabled={disabled||busy} onClick={()=>onReview(structuredClone(detail.entry.workout),detail.entry.sourceImageSha256,group,detail.entry.reviewRequired,detail.entry.sourceNotes,'data:'+detail.image_content_type+';base64,'+detail.image_base64)}> {chosen.name} prüfen &amp; für {date.split('-').reverse().join('.')} übernehmen ›</button>
   <p>Einlaufen: {detail.entry.workout.warmup.distanceMeters??'–'} m · {detail.entry.workout.warmup.notes}</p>
   <p>{chosen.notes}</p>
   <ol>{chosen.steps.map((s,i)=><li key={i}>{s.kind==='run'?'Belastung':s.kind==='recovery'?(isDrinkBreak(s)?'Trinkpause':'Trabpause'):s.kind} · {s.distanceMeters===null?'':s.distanceMeters+' m'} {s.durationSeconds===null?'':s.durationSeconds+' s'} {s.paceSecondsPerKm===null?'':formatPace(s.paceSecondsPerKm)+'/km'}<small>{comments[i]}{s.notes?' · '+s.notes:''}</small></li>)}</ol>
   <p>Auslaufen: {detail.entry.workout.cooldown.notes}</p>
   <p>Die ausgewählte Gruppe wird als geprüfte Version übernommen. Alle Gruppen des Originals bleiben in der Bibliothek.</p>
   {!!current?.versions.length&&<details className="wa-zip-management"><summary>Bereits gespeicherte Versionen ({current.versions.length})</summary>
    <p className="wa-hint">Vorhandene Versionen mit gleichem Titel bleiben separat nutzbar und werden nicht mit dem Original verschmolzen.</p>
    {current.versions.map(record=><button type="button" key={record.id} disabled={disabled||busy} onClick={()=>onSelectRecord(record)}><span>{record.workout.groups.map(g=>g.name).join(', ')}</span><small>{record.created_at.slice(0,10)} ›</small></button>)}
   </details>}
  </div>}
 </section>
}
