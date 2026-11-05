import {useEffect,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import '../styles/session-gear-editor.css'

type Shoe={id:string;name:string}
type GearRead={source:string;activityId:string;currentGearId:string|null;currentName:string|null;options:Shoe[]}
type WriteResult={saved?:boolean;garminUpdated?:boolean;error?:string}
async function request<T>(session:Session,id:string,method:'GET'|'POST',body?:unknown):Promise<{status:number;data:T}>{
  const url='/api/garmin-activity-shoe?activityId='+encodeURIComponent(id)
  const response=await fetch(url,{
    method,
    headers:{
      authorization:'Bearer '+session.access_token,
      ...(method==='POST'?{'content-type':'application/json'}:{})
    },
    ...(method==='POST'?{body:JSON.stringify(body)}:{}),
    cache:'no-store'
  })
  const data=await response.json() as T
  return {status:response.status,data}
}

export function SessionGearEditor({activityId,session}:{activityId:string;session:Session|null}) {
  const [gear,setGear]=useState<GearRead|null>(null)
  const [choice,setChoice]=useState('')
  const [editing,setEditing]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    if(!session)return
    let mounted=true
    void request<GearRead&{error?:string}>(session,activityId,'GET')
      .then(({status,data})=>{
        if(!mounted)return
        if(status!==200) throw Error(data.error||'Garmin-Ausrüstung nicht erreichbar.')
        setGear(data)
        setChoice(data.currentGearId||'')
        setEditing(false)
        setError('')
      }).catch(err=>{
        if(mounted){setGear(null);setError(err instanceof Error?err.message:'Garmin-Schuh nicht lesbar.')}
      })
    return ()=>{mounted=false}
  },[activityId,session?.access_token,refresh])

  async function save(){
    if(!session||!gear||busy)return
    const newId=choice||null
    if(newId===gear.currentGearId){setEditing(false);return}
    const name=newId?gear.options.find(g=>g.id===newId)?.name||'Unbekannt':'Kein Schuh'
    if(!window.confirm(
      `Schuh für diese Aktivität in Garmin Connect ändern?\n\n`+
      `Bisher: ${gear.currentName||'Kein Schuh'}\nNeu: ${name}\n\n`+
      'Die Änderung wird in Garmin gespeichert und anschließend geprüft. '+
      'Der Garmin-Standardschuh für zukünftige Läufe bleibt unverändert.'
    ))return
    setBusy(true);setError('');setNotice('')
    try{
      const {status,data}=await request<WriteResult>(session,activityId,'POST',{
        expectedGearId:gear.currentGearId,newGearId:newId
      })
      if(status===207 && data.garminUpdated){
        setNotice(data.error||'Garmin geändert. Bitte Equipment synchronisieren.')
        setEditing(false);setRefresh(n=>n+1)
      } else if(status!==200||!data.saved) {
        throw Error(data.error||'Schuh konnte nicht gespeichert werden.')
      } else {
        setNotice('Schuh in Garmin geändert und in GARMIN_AI aktualisiert.')
        setEditing(false);setRefresh(n=>n+1)
      }
    }catch(e){
      setError(e instanceof Error?e.message:'Änderung fehlgeschlagen. Bitte Garmin prüfen.')
      // Keep the failure visible; the user can explicitly re-read Garmin.
    }finally{setBusy(false)}
  }
  if(!session)return null
  const options=gear?.options.slice().sort((a,b)=>a.name.localeCompare(b.name,'de',{sensitivity:'base'}))||[]
  const archivedCurrent=gear?.currentGearId&&!options.some(o=>o.id===gear.currentGearId)
  return <article className="sg-editor" aria-label="Schuh dieser Laufaktivität">
    <div className="sg-head">
      <div><span className="micro-label">EQUIPMENT / GARMIN CONNECT</span><h3>Laufschuh</h3></div>
      {gear&&!editing&&<button type="button" className="secondary" onClick={()=>{setEditing(true);setNotice('')}}>Ändern</button>}
    </div>
    <p>Aktuelle Zuordnung: <strong>{gear?gear.currentName||'Kein Schuh':'Wird von Garmin geladen …'}</strong></p>
    {gear&&editing&&<div className="sg-form">
      <label>Schuh auswählen
        <select value={choice} onChange={e=>setChoice(e.target.value)} disabled={busy}>
          <option value="">Kein Schuh zugeordnet</option>
          {archivedCurrent&&<option value={gear.currentGearId!}>Aktuell: {gear.currentName} (nicht aktiv)</option>}
          {options.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <div className="sg-buttons">
        <button type="button" className="sg-save" onClick={()=>void save()} disabled={busy}>
          {busy?'Speichere …':'In Garmin speichern'}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(false)}>Abbrechen</button>
      </div>
    </div>}
    {error&&<p className="sg-error" role="alert">{error} <button type="button" onClick={()=>setRefresh(n=>n+1)}>Erneut laden</button></p>}
    {notice&&<p className="sg-notice" role="status">{notice}</p>}
    <small>Garmin bleibt führend. Diese Änderung betrifft nur den ausgewählten Lauf, nicht den Standardschuh.</small>
  </article>
}
