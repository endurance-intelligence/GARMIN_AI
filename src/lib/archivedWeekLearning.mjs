/** Closed, versioned weekly intentions vs actual Garmin evidence.
 * Aggregate comparison, not a claim of matching a workout to a session.
 * Partial archives, unknown distances and missing ratings cannot trigger changes.
 */
import {collectActual,summarizeEntries} from './trainingHistory.mjs'
import {normalizeGarminRpe,normalizeGarminFeeling} from './garminPerception.mjs'
const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const monday=d=>shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0
const round=n=>Math.round(n*10)/10
const validSnapshot=(s,start)=>s?.schema===1&&s.weekStart===start&&s.partial===false&&Array.isArray(s.entries)&&s.entries.every(e=>valid(e.date)&&e.date>=start&&e.date<=shift(start,6)&&typeof e.kind==='string'&&['approved','selected','draft','coach'].includes(e.source)&&(e.km===null||num(e.km)))
export function analyzeArchivedWeeks({today,boards=[],revisions=[]}={}){
 const empty={status:'collecting',weeks:[],completeWeeks:0,targetWeeks:0,overloadWeeks:0,caution:false,title:'Coach lernt aus deinen Trainingswochen',summary:'Noch keine vollständigen archivierten Soll-Ist-Wochen. Keine Anpassung aus fehlenden Daten.'}
 if(!valid(today)||!Array.isArray(boards)||!Array.isArray(revisions))return empty
 const starts=Array.from({length:4},(_,i)=>shift(monday(today),-7*(i+1)))
 const weeks=starts.map(start=>{
  const end=shift(start,6),versions=revisions.filter(r=>r.week_start===start&&validSnapshot(r.snapshot,start)).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)))
  const board=boards.find(b=>b.start===start&&Array.isArray(b.activities)&&Array.isArray(b.manual))
  const initial=versions[0]?.snapshot,latest=versions.at(-1)?.snapshot
  const basic={start,end,status:'unavailable',originalKm:null,plannedKm:null,actualKm:null,deltaKm:null,targetHigh:null,targetDeltaKm:null,rated:0,strained:0,overload:false}
  if(!board||!latest||!initial||revisions.some(r=>r.week_start===start&&r.snapshot?.partial!==false))return basic
  // Exclude race/recovery/taper and unknown phase. A race is not a volume error.
  const normalPhase=phase=>/grundlag|basis|aufbau|spezif|peak|letzter trainingsblock|formaufbau|fit halten|erhalt|base|build|specific/.test(phase)&&!/entlast|regener|wettkampf|taper|pause|erhol|rennwoche/.test(phase)
  const normal=[initial.phase,latest.phase].every(p=>normalPhase(String(p||'').toLowerCase()))
  const planned=summarizeEntries(latest.entries,start,end).runKm
  const original=summarizeEntries(initial.entries,start,end).runKm
  const actual=summarizeEntries(collectActual(board.activities,board.manual,today),start,end).runKm
  const runs=[...new Map(board.activities.filter(a=>a.activity_id!=null&&/run|jog|trail/i.test(a.sport_type||'')&&String(a.start_time_local||'').slice(0,10)>=start&&String(a.start_time_local||'').slice(0,10)<=end).map(a=>[String(a.activity_id),a])).values()]
  const rated=runs.filter(a=>normalizeGarminRpe(a.rpe_raw)!==null||normalizeGarminFeeling(a.feeling_raw)!==null)
  const strained=rated.filter(a=>normalizeGarminRpe(a.rpe_raw)>=8||(normalizeGarminFeeling(a.feeling_raw)!==null&&normalizeGarminFeeling(a.feeling_raw)<=25))
  const comparable=num(planned)&&planned>=10&&num(original)&&num(actual)&&runs.length>=2
  const delta=comparable?round(actual-planned):null
  // Unknown distances (e.g. selected ORC group) are never replaced with estimates.
  // A stored upper weekly target is a distinct reference, not the planned total.
  const targetHigh=num(latest.target?.low)&&num(latest.target?.high)&&latest.target.low<=latest.target.high&&latest.target.high>=10?latest.target.high:null
  const targetOnly=!comparable&&normal&&targetHigh!==null&&num(actual)&&runs.length>=2
  const targetDelta=targetOnly?round(actual-targetHigh):null
  const overload=normal&&rated.length>=2&&strained.length>=1&&(comparable&&delta>=Math.max(5,planned*.2)||targetOnly&&targetDelta>=Math.max(5,targetHigh*.2))
  return {...basic,status:comparable?'comparable':targetOnly?'target-only':'incomplete',originalKm:original,plannedKm:planned,actualKm:actual,deltaKm:delta,targetHigh,targetDeltaKm:targetDelta,rated:rated.length,strained:strained.length,overload}
 })
 const complete=weeks.filter(w=>w.status==='comparable'),targetWeeks=weeks.filter(w=>w.status==='target-only'),overload=weeks.filter(w=>w.overload)
 const caution=overload.length>=2&&weeks.slice(0,2).some(w=>w.overload)
 return {status:caution?'caution':complete.length||targetWeeks.length?'observing':'collecting',weeks,completeWeeks:complete.length,targetWeeks:targetWeeks.length,overloadWeeks:overload.length,caution,title:'Coach-Gedächtnis · archivierte Wochen',
 summary:caution?'In mindestens zwei abgeschlossenen Wochen lag der tatsächliche Laufumfang deutlich über dem zuletzt archivierten Plan oder dem dokumentierten oberen Wochenrichtwert, zugleich mit hoher subjektiver Belastung. Keine weitere Umfangssteigerung oder zusätzliche Qualität aus dieser Historie.':complete.length||targetWeeks.length?'Originalplan und letzter Planstand werden mit den gemessenen Wochenkilometern verglichen. Bei unbekannten Plandistanzen dient nur der dokumentierte Wochenrichtwert als separate Referenz. Abweichung allein löst keine Änderung aus.':'Noch keine vollständigen archivierten Soll-Ist-Wochen. Teilwochen und unbekannte Laufdistanzen werden nicht als null gewertet.'}
}
/** One bounded reduction, never a second adjustment or a change to saved plans. */
export function applyArchivedWeekLearning(days,review,{today,protectedPhase=false,otherAdjustment=false}={}){
 if(!review?.caution||protectedPhase||otherAdjustment||!valid(today))return {days,appliedDate:null}
 const candidate=days.find(d=>d.kind==='easy'&&d.sport==='running'&&d.approvable&&!d.decision&&!d.selectedGroup&&d.date>=today&&d.date<=shift(today,6)&&Number.isInteger(d.minutes)&&d.minutes>=30)
 if(!candidate)return {days,appliedDate:null}
 const minutes=candidate.minutes-5
 return {days:days.map(d=>d===candidate?{...d,minutes,title:'Wochenhistorie · '+minutes+' Min. locker',reason:d.reason+' '+review.summary+' Nächsten offenen Lauf vorsichtig um fünf Minuten kürzen. Deine Freigabe bleibt erforderlich.'}:d),appliedDate:candidate.date}
}
