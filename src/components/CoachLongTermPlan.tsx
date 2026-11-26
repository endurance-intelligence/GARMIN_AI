import {useState} from 'react'
import {buildGoalProfile,goalPhaseFocus} from '../lib/goalTrainingFocus.mjs'
import {hasEquipment} from '../lib/equipmentProfile.mjs'
import {analyzeCoachFourWeeks} from '../lib/coachFourWeeks.mjs'
import {buildLongTermCoachPlan} from '../lib/coachLongTermPlan.mjs'
import type {LongTermWeek} from '../lib/coachLongTermPlan.mjs'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {Icon} from './Icon'
import '../styles/coach-long-term.css'

const short=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'
const interval=(week:LongTermWeek)=>short(week.start)+' – '+short(week.end)
const phaseIcon=(week:LongTermWeek)=>week.isRaceWeek?'flag':week.phase==='recovery'||week.phase==='paused'?'heart-pulse':week.phase==='taper'?'activity':'footprints'
export function CoachLongTermPlan({today,snapshot}:{
 today:string;snapshot:CoachSnapshot
}){
 const plan=buildLongTermCoachPlan({
  today,goal:snapshot.goal,health:snapshot.health,life:snapshot.life,racePortfolio:snapshot.racePortfolio,history:analyzeCoachFourWeeks({today,boards:snapshot.boards,plans:snapshot.plans,life:snapshot.life})
 })
 const identity=JSON.stringify([plan.raceName,plan.raceDate,plan.hasGoal])
 const [selection,setSelection]=useState<{identity:string;start:string}|null>(null)
 const current=plan.weeks.find(w=>w.isCurrent)||plan.weeks[0]
 const week=(selection?.identity===identity?plan.weeks.find(w=>w.start===selection.start):undefined)||current
 const raceWeek=plan.weeks.find(w=>w.isRaceWeek)
 const profile=buildGoalProfile({today,goal:snapshot.goal,route:snapshot.goalRoute})
 const phaseFocus=week?goalPhaseFocus(profile,week.phase,{deload:week.index%4===0,hasBase:week.targetKm!==null}):null
 const goalAhead=plan.hasGoal&&plan.raceDate&&plan.raceDate>=today
 return <section className="cltp-root" aria-label="Dein langfristiger Trainingsfahrplan">
  <header className="cltp-roadmap-head">
   <div><small className="cltp-kicker">DEIN TRAININGSFAHRPLAN</small>
    <h2>{goalAhead?'Dein Weg zum Ziel':plan.weeks.length?'Dein nächster Trainingsblock':'Dein nächster Schritt'}</h2>
    <p>{goalAhead&&plan.raceName?plan.raceName+' · '+short(plan.raceDate!)+plan.raceDate!.slice(0,4):'Deine Planung passt sich deinem Training an.'}</p></div>
   {plan.weeks.length>0&&<div className="cltp-horizon"><strong>{plan.weeks.length}</strong><span>WOCHEN<br/>VORSCHAU</span></div>}
  </header>
  {plan.weeks.length===0?<p className="cltp-empty">{plan.message}</p>:<>
   <div className="cltp-roadmap-caption"><span>Deine Wochen</span><small>Woche auswählen</small></div>
   <div className="cltp-roadmap" role="group" aria-label="Trainingswoche auswählen">
    {plan.weeks.map(w=><button type="button" key={w.start} className={'cltp-step cltp-step-'+w.phase+(w.isCurrent?' is-current':'')+(w.isRaceWeek?' is-race':'')+(week?.start===w.start?' is-selected':'')}
     aria-pressed={week?.start===w.start} aria-current={w.isCurrent?'date':undefined}
     aria-label={'Woche '+w.index+', '+interval(w)+', '+w.phaseLabel+(w.isRaceWeek?', Zielwoche':'')}
     onClick={()=>setSelection({identity,start:w.start})}>
     <span className="cltp-step-top"><small>W{String(w.index).padStart(2,'0')}</small><Icon name={phaseIcon(w)}/></span>
     <strong>{w.phaseLabel}</strong>
     <span className="cltp-step-date">{interval(w)}</span>
     <span className="cltp-step-marker">{w.isCurrent?'JETZT':w.isRaceWeek?'DEIN ZIEL':' '}</span>
    </button>)}
   </div>
   {week&&<div className={'cltp-focus cltp-step-'+week.phase} aria-live="polite">
    <div className="cltp-focus-top"><div><div className="cltp-focus-meta">WOCHE {String(week.index).padStart(2,'0')} <span>· {interval(week)}</span></div>
      <h3>{week.key}</h3></div><span className="cltp-focus-status"><Icon name={phaseIcon(week)}/>{week.phaseLabel}</span></div>
    <p className="cltp-focus-copy">{week.focus}</p>
    <div className="cltp-focus-metrics">
     <div><small>LAUFUMFANG</small><strong>{week.targetKm!==null?week.targetKm.low+'–'+week.targetKm.high:'—'}{week.targetKm!==null&&<em> km</em>}</strong><span>{week.targetKm!==null?'Grobe Orientierung':week.isRaceWeek?'Keine normale Laufwoche':week.phase==='recovery'?'Erholung hat Vorrang':'Noch keine feste Vorgabe'}</span></div>
     <div><small>LANGER LAUF</small><strong>{week.longRunMinutes!==null?week.longRunMinutes:'—'}{week.longRunMinutes!==null&&<em> min</em>}</strong><span>{week.longRunMinutes!==null?'Ungefähr':'Nicht vorgegeben'}</span></div>
     <div><small>INTENSITÄT</small><strong>{week.qualityOptions>0?'Max. 1':'0'}</strong><span>{week.qualityOptions>0?'Harte Option · sonst locker':'Harte Einheiten empfohlen'}</span></div>
    </div>
    {phaseFocus&&<div className="cltp-goal-focus"><div><small>DEIN ZIELPROFIL</small><strong>{profile.label}{profile.ascentM!==null?' · '+profile.ascentM.toLocaleString('de-DE')+' hm':''}</strong><p>{profile.requirements.join(' · ')}</p></div><div><small>TRAININGSREIZ DIESER WOCHE</small><strong>{phaseFocus.title}</strong><p>{phaseFocus.focus}</p><p className="cltp-complement">{phaseFocus.complement}</p>{profile.hills&&week.targetKm!==null&&['base','build','specific'].includes(week.phase)&&week.index%4!==0&&hasEquipment(snapshot.life.equipmentProfile,'treadmill')&&<p>Dein Laufband kann als kontrollierte Bergauf-Alternative dienen. Konkrete Einheit erst nach aktueller Erholungsprüfung im Coach.</p>}</div><small className="cltp-terrain-note">{profile.terrainNote}</small></div>}
    {week.isRaceWeek&&<p className="cltp-race-note"><Icon name="flag"/> Zielwoche: {plan.raceName}. Der Start ist ein eigener Meilenstein, kein normales Wochenkilometerziel.</p>}
    {!week.isCurrent&&current&&<button type="button" className="cltp-back-current" onClick={()=>setSelection({identity,start:current.start})}>Zur aktuellen Woche</button>}
   </div>}
   <div className="cltp-bottom"><span><Icon name="calendar-range"/> Planung · keine automatische Trainingsfreigabe</span>
    {raceWeek&&week?.start!==raceWeek.start&&<button type="button" className="cltp-race-jump" onClick={()=>setSelection({identity,start:raceWeek.start})}><Icon name="flag"/> Zielwoche ansehen</button>}</div>
  </>}
  <details className="cltp-explanation">
   <summary>Wie dein Coach plant <Icon name="chevron-down"/></summary>
   <div className="cltp-explanation-body">
    <p>{plan.message}</p>
    {plan.baselineKm!==null&&<p>Ausgangspunkt: ungefähr <strong>{plan.baselineKm} km/Woche</strong> aus mindestens drei vollständig gemessenen abgeschlossenen Wochen ohne bekannte Rennwoche. Laufumfang grob, keine Trainingsfreigabe.</p>}
    {week&&<p>{week.polarization}</p>}
    {plan.notes.length>0&&<div className="cltp-notes">{plan.notes.map((note,i)=><p key={i}><Icon name="info"/> {note}</p>)}</div>}
    <p className="cltp-disclaimer">Nur Planungsrahmen. Keine automatischen Kalenderänderungen. Tagesform, tatsächliches Training und deine Freigabe bestimmen die nächsten Einheiten.</p>
   </div>
  </details>
 </section>
}
