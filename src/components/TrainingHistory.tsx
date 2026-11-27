import {useEffect,useMemo,useState} from 'react'
import {historyModel,SPORTS} from '../lib/trainingHistory.mjs'
import type {HistorySummary,SportGroup} from '../lib/trainingHistory.mjs'
import {readTrainingMonth} from '../lib/trainingHistoryApi'
import {berlinDateToday} from '../lib/coachGoal'
import {Icon} from './Icon'
import '../styles/training-history.css'
const names:Record<SportGroup,string>={running:'Laufen',rowing:'Rudern',strength:'Stabi & Mobility',cycling:'Radfahren',football:'Fußball',hiking:'Hiking & Gehen',other:'Sonstiges Training'}
const icons:Record<SportGroup,string>={running:'footprints',rowing:'waves',strength:'activity',cycling:'bike',football:'target',hiking:'footprints',other:'activity'}
const f=(x:number|null)=>x===null?'–':x.toLocaleString('de-DE',{maximumFractionDigits:1})
const duration=(x:number|null)=>x===null?'–':Math.floor(x/60)+'h '+String(x%60).padStart(2,'0')+'m'
const short=(d:string)=>d.slice(8,10)+'.'+d.slice(5,7)+'.'
const shiftMonth=(m:string,n:number)=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7))-1+n,1,12)).toISOString().slice(0,7)
function SummaryRows({actual,planned,original}:{actual:HistorySummary;planned:HistorySummary|null;original:HistorySummary|null}){
 const showOriginal=!!original&&!!planned&&SPORTS.some((_,i)=>original.rows[i].count!==planned.rows[i].count||original.rows[i].minutes!==planned.rows[i].minutes||original.rows[i].km!==planned.rows[i].km)
 return <div className="th-rows">
  <div className={'th-row th-row-head'+(showOriginal?' has-original':'')}><span>TRAININGSART</span>{showOriginal&&<span>URSPR.</span>}<span>GEPLANT</span><span>GEMACHT</span></div>
  {SPORTS.map((kind,i)=>{
   const a=actual.rows[i],p=planned?.rows[i],o=original?.rows[i]
   if(!a.count&&!p?.count&&!o?.count)return null
   return <div className={'th-row'+(showOriginal?' has-original':'')} key={kind}>
    <span className="th-sport"><Icon name={icons[kind]}/><span><strong>{names[kind]}</strong><small>{kind==='running'?f(a.km)+' km':duration(a.minutes)}</small></span></span>
    {showOriginal&&<span>{o?o.count+'×':'–'}{o&&o.count>0&&<small style={{display:'block'}}>{kind==='running'?f(o.km)+' km':duration(o.minutes)}</small>}</span>}
    <span>{p?p.count+'×':'–'}{p&&p.count>0&&<small style={{display:'block'}}>{kind==='running'?f(p.km)+' km':duration(p.minutes)}</small>}</span><strong className={p&&p.count>0&&a.count>=p.count?'th-positive':''}>{a.count}×</strong>
   </div>
  })}
 </div>
}
export function TrainingHistory({active,onCalendar,focusToken=0}:{active:boolean;onCalendar:()=>void;focusToken?:number}){
 const today=berlinDateToday(),current=today.slice(0,7)
 const [month,setMonth]=useState(current)
 const [view,setView]=useState<'month'|'weeks'>('month')
 const [data,setData]=useState<Awaited<ReturnType<typeof readTrainingMonth>>|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [refresh,setRefresh]=useState(0)
 useEffect(()=>{if(focusToken){setMonth(current);setRefresh(n=>n+1)}},[focusToken,current])
 useEffect(()=>{
  const changed=()=>setRefresh(n=>n+1)
  window.addEventListener('garmin-ai-training-history-changed',changed)
  return ()=>window.removeEventListener('garmin-ai-training-history-changed',changed)
 },[])
 useEffect(()=>{
  if(!active)return
  const controller=new AbortController()
  setLoading(true);setError('');setData(null)
  void readTrainingMonth(month,controller.signal).then(d=>{if(!controller.signal.aborted)setData(d)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Historie nicht verfügbar.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return ()=>controller.abort()
 },[active,month,refresh])
 const model=useMemo(()=>data?.month===month?historyModel(data):null,[data,month])
 const monthLabel=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'))
 if(!active)return null
 return <section id="training-history" className="th-history training-view-panel" aria-label="Meine Trainingshistorie">
  <header className="training-view-heading"><h2>Meine Trainingshistorie</h2><p>Wochen und Monate · dauerhaft gespeicherte Planstände · Soll &amp; Ist</p></header>
  <div className="th-body">
   <div className="th-month-nav"><button type="button" aria-label="Vorheriger Monat" disabled={month<='2000-01'} onClick={()=>setMonth(m=>shiftMonth(m,-1))}>‹</button><h3>{monthLabel}</h3><button type="button" aria-label="Nächster Monat" disabled={month>=shiftMonth(current,1)} onClick={()=>setMonth(m=>shiftMonth(m,1))}>›</button></div>
   <div className="th-tabs" role="group" aria-label="Ansicht"><button type="button" aria-pressed={view==='month'} onClick={()=>setView('month')}>Monat</button><button type="button" aria-pressed={view==='weeks'} onClick={()=>setView('weeks')}>Wochen</button></div>
   {loading&&<p role="status">Trainingshistorie wird geladen …</p>}
   {error&&<p role="alert">{error} <button type="button" onClick={()=>setRefresh(n=>n+1)}>Erneut laden</button></p>}
   {model&&<>
    {view==='month'&&<>
     <div className="th-metrics"><div><small>LAUFKILOMETER</small><strong>{f(model.actual.runKm)} <em>km</em></strong></div><div><small>TRAININGSZEIT</small><strong>{duration(model.actual.minutes)}</strong></div><div><small>EINHEITEN</small><strong>{model.actual.total}</strong></div></div>
     <div className="th-chart"><small>LAUFUMFANG · ISO-WOCHEN (volle Wochen)</small><div className="th-bars">{model.weeks.map(w=>{const max=Math.max(1,...model.weeks.map(x=>Math.max(x.actual.runKm??0,x.last?.snapshot.target?.high??0)));return <div key={w.start}><strong>{f(w.actual.runKm)}</strong><div className="th-bar-area"><i style={{height:(w.actual.runKm??0)/max*100+'%'}}/>{w.last?.snapshot.target&&<b style={{bottom:w.last.snapshot.target.low/max*100+'%'}}/>}</div><small>{short(w.start)}</small></div>})}</div><small>Linie = unterer gespeicherter Wochenrichtwert. Monatskennzahlen zählen nur Tage des ausgewählten Monats.</small></div>
     <SummaryRows actual={model.actual} planned={model.savedWeeks?model.planned:null} original={model.savedWeeks?model.original:null}/>
     <p className="th-note">Geplant: nur datierte Einträge der zuletzt gespeicherten Planstände ({model.savedWeeks}/{model.weeks.length} überlappende Wochen archiviert). Fehlende Planstände sind unbekannt, keine versäumten Einheiten. Monatskilometer sind tatsächliche Garmin-Läufe, kein aus anderen Sportarten errechneter Ersatz.</p>
    </>}
    {view==='weeks'&&<div className="th-weeks">{model.weeks.map(w=><details key={w.start} className="th-week"><summary><span><small>{short(w.start)} – {short(w.end)}</small><strong>{w.last?.snapshot.phase||'Trainingswoche'}</strong></span><span><strong>{f(w.actual.runKm)} km</strong><small>{w.actual.total} Einheiten · {w.versions?w.versions+' Planstand/stände':'kein archivierter Plan'}</small></span><Icon name="chevron-down"/></summary>
     <div className="th-week-body"><div className="th-metrics"><div><small>URSPR. LAUFZIEL</small><strong>{w.first?.snapshot.target?w.first.snapshot.target.low+'–'+w.first.snapshot.target.high:'–'}</strong></div><div><small>AKTUELLER RICHTWERT</small><strong>{w.last?.snapshot.target?w.last.snapshot.target.low+'–'+w.last.snapshot.target.high:'–'}</strong></div><div><small>GELAUFEN</small><strong>{f(w.actual.runKm)} km</strong></div></div>
      <SummaryRows actual={w.actual} planned={w.planned} original={w.original}/>
      {w.last?<p className="th-note">Erster Planstand: {new Date(w.first!.created_at).toLocaleDateString('de-DE')} · letzter Stand: {new Date(w.last.created_at).toLocaleDateString('de-DE')}. {w.first?.snapshot.partial?'Erst unter der Woche erfasst, kein rekonstruierter Wochenbeginn.':''}</p>:<p className="th-note">Für diese Woche existiert kein gespeicherter Soll-Stand. Die tatsächlich erfassten Aktivitäten bleiben sichtbar.</p>}
     </div></details>)}</div>}
    <p className="th-note">Garmin-Archiv und manuelle Ergänzungseinheiten. Plausible doppelte manuelle Einträge (gleicher Sport, Tag und Dauer ±5 Min.) werden einmal gezählt. Nicht synchronisierte Aktivitäten können fehlen.</p>
   </>}
   <button type="button" className="th-secondary" onClick={onCalendar}>Zum Kalender</button>
  </div>
 </section>
}
