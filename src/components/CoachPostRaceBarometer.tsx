import {useEffect,useMemo,useState} from 'react'
import {berlinDateToday} from '../lib/coachGoal'
import {coachAddDays} from '../lib/coachSevenDay.mjs'
import type {CoachContextPayload,CoachRaceCheck} from './CoachLifeContext'
import {Icon} from './Icon'
import '../styles/coach-postrace.css'

type Goal={race_date?:string;race_name?:string;distance_km?:number}
type Props={
 goal:Record<string,unknown>;life:CoachContextPayload|null;busy:boolean;
 onSave:(action:{action:string;[key:string]:string|number|boolean|null})=>Promise<void>
}
const dateText=(iso:string)=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'))
const label=(score:number)=>score>=7?'Stark erschöpft':score>=4?'Deutlich belastet':'Schon recht erholt'
export function CoachPostRaceBarometer({goal,life,busy,onSave}:Props){
 const today=berlinDateToday()
 const target=(goal?.goal||null) as Goal|null
 const history=life?.context?.race_recovery_checks||[]
 const relevant=history.filter(x=>x.raceDate<=today&&x.raceDate>=coachAddDays(today,-30))
 const recent=relevant.length?[...relevant].sort((a,b)=>b.raceDate.localeCompare(a.raceDate)||b.reportedOn.localeCompare(a.reportedOn))[0]:null
 const targetDate=target?.race_date||''
 const raceDate=targetDate<=today&&targetDate>=coachAddDays(today,-30)?targetDate:recent?.raceDate||null
 const raceName=raceDate===targetDate?target?.race_name||'Dein Rennen':recent?.raceName||'Dein Rennen'
 const entries=useMemo(()=>raceDate?history.filter(x=>x.raceDate===raceDate).sort((a,b)=>a.reportedOn.localeCompare(b.reportedOn)):[],[history,raceDate])
 const latest:CoachRaceCheck|null=entries.at(-1)||null
 const [fatigue,setFatigue]=useState<number|null>(null)
 const [soreness,setSoreness]=useState<number|null>(null)
 const [warning,setWarning]=useState(false)
 useEffect(()=>{
  setFatigue(latest?.fatigue??null)
  setSoreness(latest?.soreness??null)
  setWarning(latest?.warning??false)
 },[raceDate,latest?.reportedOn,latest?.fatigue,latest?.soreness,latest?.warning])
 if(!raceDate||!life)return null
 const age=Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(raceDate+'T12:00:00Z'))/86400000)
 const previous=entries.length>=2?entries[entries.length-2]:null
 const current=fatigue===null||soreness===null?null:Math.max(fatigue,soreness)
 return <section className="prb-root" aria-label="Dein persönlicher Erholungs-Check nach dem Wettkampf">
  <div className="prb-top">
   <div><span className="prb-eyebrow"><Icon name="activity"/> RACE RECOVERY / DEIN CHECK-IN</span>
    <h3>Wie sehr bist du im Arsch?</h3>
    <p>{raceName} · {dateText(raceDate)} · {age===0?'Renntag':age+' Tage danach'}</p></div>
   <span className={'prb-status prb-level-'+(warning?'alert':current===null?'pending':current>=7?'high':current>=4?'mid':'low')}>
    {warning?'Warnzeichen gemeldet':current===null?'Noch nicht eingeschätzt':label(current)}</span>
  </div>
  <p className="prb-intro">Du gibst das Körpergefühl vor. Der Coach berücksichtigt es zusammen mit echten Garmin-Daten.
   Keine pauschale Kalendersperre und kein automatisch erfundener Readiness-Score.</p>
  <div className="prb-sliders">
   <label><span><strong>Gesamte Erschöpfung</strong><b>{fatigue===null?'–':fatigue}/10</b></span>
    <input type="range" min="0" max="10" step="1" value={fatigue??5} disabled={busy}
     onChange={e=>setFatigue(Number(e.target.value))}/>
    <small>0 = wieder frisch · 10 = komplett platt</small></label>
   <label><span><strong>Beine / Muskelkater</strong><b>{soreness===null?'–':soreness}/10</b></span>
    <input type="range" min="0" max="10" step="1" value={soreness??5} disabled={busy}
     onChange={e=>setSoreness(Number(e.target.value))}/>
    <small>0 = locker · 10 = erhebliche Beschwerden</small></label>
  </div>
  <div className="prb-meter" role="img" aria-label={current===null?'Noch keine subjektive Belastung erfasst':'Subjektive Belastung '+current+' von 10'}>
   <div style={{width:((current??0)*10)+'%'}}/></div>
  <label className="prb-warning"><input type="checkbox" checked={warning} disabled={busy}
   onChange={e=>setWarning(e.target.checked)}/>
   Ungewöhnliche Warnzeichen (z. B. Brustschmerz, Atemnot, Schwindel oder zunehmende Schmerzen)</label>
  <div className="prb-bottom">
   <p>{latest?'Letzter Check-in: '+dateText(latest.reportedOn)+(previous?
    ' · vorher max. '+Math.max(previous.fatigue,previous.soreness)+'/10':''):
    'Noch kein Check-in erfasst.'}
    <br/>Eine gute Zahl ist keine Freigabe für Intervalle. Bei Warnzeichen medizinisch abklären.</p>
   <button type="button" disabled={busy||fatigue===null||soreness===null} onClick={()=>void onSave({action:'record_race_recovery',
    raceDate,raceName,fatigue,soreness,warning})}>
    <Icon name="check"/> {busy?'Speichere …':'Check-in speichern & Coach aktualisieren'}
   </button>
  </div>
 </section>
}
