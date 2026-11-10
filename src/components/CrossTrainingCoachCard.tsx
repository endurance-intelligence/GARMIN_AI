/**
 * Real Coach context from Garmin Personal API and manual cross-training.
 * No invented readiness score; confidence based on observed activities.
 */
import {useEffect,useMemo,useState} from 'react'
import {Icon} from './Icon'
import {loadCrossTraining,crossKind,daysSince} from '../lib/crossTrainingClient'
import type {CrossResponse} from '../lib/crossTrainingClient'
import '../styles/cross-training-coach.css'

export function CrossTrainingCoachCard({active,onOpen}:{active:boolean;onOpen:()=>void}){
 const [data,setData]=useState<CrossResponse|null>(null)
 const [error,setError]=useState(false)
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setError(false)
  void loadCrossTraining().then(next=>{if(mounted)setData(next)})
   .catch(()=>{if(mounted)setError(true)})
  return ()=>{mounted=false}
 },[active])
 const context=useMemo(()=>{
  if(!data)return null
  const relevantGarmin=data.garmin.filter(x=>daysSince(x.start_time_local)>=0&&daysSince(x.start_time_local)<=7)
  const recentManual=data.manual.filter(x=>daysSince(x.session_date)>=0&&daysSince(x.session_date)<=7)
  const counted=new Set(relevantGarmin.map(x=>crossKind(x.sport_type)+'|'+x.start_time_local.slice(0,10)))
  const uniqueManual=recentManual.filter(x=>!counted.has(x.kind+'|'+x.session_date))
  const activities=[
   ...relevantGarmin.map(x=>({kind:crossKind(x.sport_type),date:x.start_time_local.slice(0,10),
      minutes:Math.round((x.duration_s||0)/60),source:'Garmin'})),
   ...uniqueManual.map(x=>({kind:x.kind,date:x.session_date,minutes:x.duration_minutes,source:'Manuell'}))
  ]
  const football=activities.filter(x=>x.kind==='football')
  const rowing=activities.filter(x=>x.kind==='rowing')
  const strength=activities.filter(x=>x.kind==='strength'||x.kind==='mobility')
  const playedRecently=football.some(x=>daysSince(x.date)<=2)
  const note=playedRecently?
   'Fußball liegt erst kurz zurück. Der Coach sollte vor der nächsten harten Bahneinheit Beine, Schlaf und Erholung prüfen – nicht automatisch Intervalle draufpacken.':
   strength.length===0?
   'Diese Woche ist noch keine Stabi-/Mobility-Einheit erfasst. Als ergänzende Option anbieten, nicht automatisch verpflichtend einplanen.':
   'Stabi und Mobility sind bereits im Wochenkontext berücksichtigt. Keine 1:1-Umrechnung in Laufkilometer.'
  return {football:football.length,rowing:rowing.length,strength:strength.length,note}
 },[data])
 if(!active)return null
 return <section className="cx-coach" aria-label="Kraft Mobility und Ruderbelastung im Coach">
  <div className="cx-head">
   <div><span className="cx-kicker">COACH / GANZHEITLICHE BELASTUNG</span>
    <h3>Mehr als Laufkilometer.</h3>
    <p>Fußball, Rudern, Stabi und Mobility fließen in deinen Wochenkontext ein.</p></div>
   <button type="button" onClick={onOpen}><Icon name="arrow-up-right"/> Stabi Studio</button>
  </div>
  {context?<><div className="cx-stats">
   <div><span>⚽</span><strong>{context.football}</strong><small>Fußball · 7 Tage</small></div>
   <div><span>🚣</span><strong>{context.rowing}</strong><small>Rudern · 7 Tage</small></div>
   <div><span>🧘</span><strong>{context.strength}</strong><small>Stabi & Mobility · 7 Tage</small></div>
  </div>
   <p className="cx-evidence"><Icon name="info"/>{context.note}</p>
   <small className="cx-note">Grundlage: echte Garmin-Aktivitäten + bestätigte manuelle Einheiten.
    Belastungen werden nicht in künstliche Kilometer oder Scores umgerechnet.</small>
  </>:<p className="cx-note">{error?'Ergänzende Sportarten gerade nicht abrufbar.':'Ergänzende Aktivitäten werden geprüft …'}</p>}
 </section>
}
