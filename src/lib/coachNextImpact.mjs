/**
 * P3: one traceable Coach implication from a uniquely matched Garmin run.
 * Works only with existing owner-authenticated calendar/plan evidence.
 * No read/write effects, artificial readiness score, or assumption that
 * longer duration proves a harder intensity.
 */
import {buildCoachSessionBridge} from './coachSessionBridge.mjs'

const DAY=86400000
const dayMs=s=>Date.parse(String(s)+'T12:00:00Z')
const daysBetween=(later,earlier)=>Math.round((dayMs(later)-dayMs(earlier))/DAY)
const round5=n=>Math.round(n/5)*5
const finite=n=>typeof n==='number'&&Number.isFinite(n)
export function analyzeRecentCoachImpact({today,boards,plans}={}){
 const none={status:'unavailable',latest:null,reason:'Plan-/Ist-Daten fehlen.',fresh:false,
  severe:false,daysOld:null}
 if(typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today)||!
  Number.isFinite(dayMs(today)))return none
 const view=buildCoachSessionBridge({boards,plans,today,limit:10})
 if(view.status==='unavailable')return none
 const available=view.items.filter(x=>{
  const delta=daysBetween(today,x.date.slice(0,10))
  return Number.isInteger(delta)&&delta>=0&&delta<=6
 })
 const linked=available.filter(x=>x.match.status==='matched'&&x.match.plan&&
  x.match.plan.actualMinutes!==null&&x.match.plan.plannedMinutes!==null)
 if(!linked.length)return {...none,status:available.length?'unlinked':'empty',
  reason:available.length?'Letzte Garmin-Läufe liegen vor, aber kein zeitlich eindeutig passender freigegebener Coach-Lauf. RPE wird weiterhin separat berücksichtigt.':
   'Keine Garmin-Läufe in den geladenen letzten sieben Tagen.'}
 // Do not mix two separate runs or their reported feelings.
 const latest=linked[0]
 const plan=latest.match.plan
 const delta=plan.durationDeltaMinutes
 const threshold=Math.max(15,Math.ceil(plan.plannedMinutes*0.3))
 const overlong=finite(delta)&&delta>=threshold
 const highRpe=latest.rpe!==null&&latest.rpe>=8
 const weakFeeling=latest.feeling==='Schwach'||latest.feeling==='Sehr schwach'
 const severe=overlong&&(highRpe||weakFeeling)
 const daysOld=daysBetween(today,latest.date.slice(0,10))
 const fresh=daysOld<=2
 const title=severe?'Zuletzt länger und deutlich belastend':
  overlong?'Länger als geplant – Belastung separat prüfen':
  highRpe||weakFeeling?'Als anstrengend empfunden':
  'Keine zusätzliche Kürzung aus diesem Lauf'
 const evidence='Coach-Plan '+plan.plannedMinutes+' Min., Garmin '+
  plan.actualMinutes+' Min.'+(delta!==null?' ('+(delta>0?'+':'')+delta+' Min.)':'')+
  (latest.rpe!==null?', Garmin-RPE '+latest.rpe+'/10':'')+
  (latest.feeling?', Gefühl '+latest.feeling:'')+'.'
 const reason=severe?
  'Die zeitliche Abweichung und deine eigene Bewertung sprechen zusammen für einen vorsichtigeren nächsten offenen Vorschlag.':
  overlong?
   'Die Einheit dauerte deutlich länger als geplant, aber ohne passende hohe subjektive Belastung wird daraus allein keine neue Kürzung abgeleitet.':
  highRpe||weakFeeling?
   'Deine subjektive Garmin-Bewertung wird vom bestehenden Recovery-Coach berücksichtigt; die Dauer allein begründet keine weitere Anpassung.':
   'Weder eine deutliche Verlängerung noch eine hohe subjektive Belastung sind für diesen Vergleich belegt. Keine Belastungssteigerung daraus ableiten.'
 return {status:severe?'reduce':overlong||highRpe||weakFeeling?'observe':'stable',
  latest:{activityId:latest.id,date:latest.date.slice(0,10),title:latest.title,
   planTitle:plan.title,plannedMinutes:plan.plannedMinutes,
   actualMinutes:plan.actualMinutes,deltaMinutes:delta,
   rpe:latest.rpe,feeling:latest.feeling},
  reason,title,evidence,severe,fresh,daysOld}
}
export function applyRecentCoachImpact(days,impact,{today,raceDate,ill=false,
 returning=false,postIllness=false}={}){
 const initial={...impact,effect:'none',appliedDate:null,previousMinutes:null,
  nextMinutes:null,message:''}
 if(!Array.isArray(days)||!impact||impact.status==='unavailable'||!today)
  return {days,impact:initial}
 if(impact.status!=='reduce'||!impact.fresh)
  return {days,impact:{...initial,message:impact.status==='reduce'?
   'Die starke Abweichung liegt mehr als zwei Tage zurück. Keine neue kurzfristige Kürzung.':
   'Kein zusätzlicher Eingriff in die nächste Einheit.'}}
 const raceOffset=typeof raceDate==='string'&&Number.isFinite(dayMs(raceDate))?
  daysBetween(raceDate,today):null
 if(ill||returning||postIllness||(raceOffset!==null&&raceOffset>=-14&&raceOffset<=10))
  return {days,impact:{...initial,effect:'protected',
   message:'Rennphase, Regeneration oder Wiedereinstieg hat Vorrang. Die bestehenden Empfehlungen bleiben unverändert.'}}
 // A new recommendation is possible only for the first not-yet-decided,
 // non-scheduled easy/long run within the immediate next three days.
 const candidate=days.find(day=>day&&day.date>=today&&
  day.date<=new Date(dayMs(today)+3*DAY).toISOString().slice(0,10)&&
  ['easy','long'].includes(day.kind)&&day.approvable&&!day.decision&&
  Number.isInteger(day.minutes)&&day.minutes>=20)
 if(!candidate)return {days,impact:{...initial,effect:'no-slot',
  message:'Kein offener lockerer Coach-Lauf in den nächsten drei Tagen. Bestehende Termine und Entscheidungen bleiben unangetastet.'}}
 const original=candidate.minutes
 const smaller=Math.max(20,Math.min(original,round5(original*.8)))
 const reason=impact.evidence+' '+impact.reason+
  ' Du entscheidest über den Vorschlag. Keine Kalender- oder Garmin-Änderung.'
 const rewritten=days.map(x=>x!==candidate?x:smaller<original?
  {...x,kind:'easy',title:'Nach Garmin-Feedback · '+smaller+' Min. locker',
   minutes:smaller,reason:x.reason+' '+reason}:
  {...x,reason:x.reason+' '+reason})
 return {days:rewritten,impact:{...initial,effect:smaller<original?'shortened':'already-conservative',
  appliedDate:candidate.date,previousMinutes:original,nextMinutes:smaller,
  message:smaller<original?
   'Der nächste offene lockere Vorschlag wird von '+original+' auf '+smaller+
   ' Minuten verkürzt. Erst deine Freigabe erzeugt einen Entwurf.':
   'Der nächste offene Vorschlag ist bereits kurz und locker ('+original+
   ' Min.). Kein weiteres Kürzen erforderlich.'}}
}
