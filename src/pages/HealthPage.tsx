import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {healthOverview,shiftDay} from '../lib/healthOverview.mjs'
import {HealthHistoryChart} from '../components/HealthHistoryChart'
import {HealthProfileCard} from '../components/HealthProfileCard'
import type {HealthPreferences} from '../lib/healthPreferences.mjs'
import {SyncCenter} from '../components/SyncCenter'
import type {Page} from '../navigation'
import '../styles/health-dashboard.css'
const berlinToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const specs:Record<string,{name:string;unit:string;convert:(n:number)=>number}>={hrv_ms:{name:'HRV',unit:'ms',convert:n=>n},resting_heart_rate:{name:'Ruhepuls',unit:'bpm',convert:n=>n},sleep_seconds:{name:'Schlaf',unit:'h',convert:n=>n/3600},stress_avg:{name:'Tagesstress',unit:'/100',convert:n=>n},body_battery_max:{name:'Body Battery Maximum',unit:'/100',convert:n=>n}}
export function HealthPage({active,onGo}:{active:boolean;onGo:(p:Page)=>void}){
 const [preferences,setPreferences]=useState<HealthPreferences|null>(null)
 const [rows,setRows]=useState<unknown[]>([]),[status,setStatus]=useState<'loading'|'ok'|'error'>('loading'),[refresh,setRefresh]=useState(0)
 useEffect(()=>{if(!active)return;const c=new AbortController();setRows([]);setStatus('loading')
  void (async()=>{try{const session=(await garminSupabase?.auth.getSession())?.data.session;if(!session)throw Error('Login');const r=await fetch(garminSupabaseUrl+'/functions/v1/read-garmin-health',{signal:c.signal,cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}});if(!r.ok)throw Error('HTTP');const d=await r.json();if(!Array.isArray(d.metrics))throw Error('Data');if(!c.signal.aborted){setRows(d.metrics);setStatus('ok')}}catch{if(!c.signal.aborted)setStatus('error')}})()
  return()=>c.abort()
 },[active,refresh])
 if(!active)return null
 const today=berlinToday(),metrics=healthOverview(rows,today),fmt=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
 return <section className="page active health-dashboard">
  <div className="page-intro"><div><div className="eyebrow">HEALTH INTELLIGENCE</div><h1>Deine Gesundheit.</h1><p>Entwicklungen verstehen, nicht einzelne Messwerte bewerten.</p></div><button className="secondary" type="button" onClick={()=>setRefresh(n=>n+1)}>Aktualisieren</button></div>
  <div className="health-section"><h2>Gewicht & Entwicklung</h2><p>Wiegen ist freiwillig. Schwankungen sind normal. Gewicht allein löst keine Trainingsänderung aus.</p><SyncCenter active={active} mode="weight" expandedHealth healthPreferences={preferences}/> <p>Für den BMI benötigen wir bestätigte Körpergröße und ein Erwachsenenprofil. <button type="button" className="secondary" onClick={()=>onGo('settings')}>Garmin-Profil prüfen</button></p><HealthProfileCard active={active} onPreferences={setPreferences}/></div>
  <div className="health-section"><h2>Regeneration & Gesundheit</h2><p>Deine persönlichen Werte aus Garmin · 7-Tage-Median erst ab vier Messungen.</p>
  {status==='loading'&&<p role="status">Lade Messwerte …</p>}{status==='error'&&<p role="alert">Gesundheitsdaten konnten nicht geladen werden.</p>}
  {status==='ok'&&<div className="health-metric-grid">{metrics.map(m=>{const spec=specs[m.key];const end=['stress_avg','body_battery_max'].includes(m.key)?shiftDay(today,-1):today;return <article key={m.key}><small>{spec.name}</small><h3>{m.latest?fmt(spec.convert(m.latest.value))+' '+spec.unit:'–'}</h3><p>{m.latest?'Messdatum: '+m.latest.date:'Noch kein Messwert'}{end!==today?' · letzter abgeschlossener Tag':''}</p><p>7-Tage-Median: <strong>{m.median!==null?fmt(spec.convert(m.median))+' '+spec.unit:'Noch zu wenig Daten'}</strong> · {m.count}/7</p><HealthHistoryChart points={m.points.map(p=>({...p,value:spec.convert(p.value)}))} end={end} label={spec.name} unit={spec.unit}/></article>})}</div>}
  </div><p>Keine Diagnose oder automatische Trainingsfreigabe. Zyklusdaten werden derzeit nicht automatisch importiert.</p>
 </section>
}
