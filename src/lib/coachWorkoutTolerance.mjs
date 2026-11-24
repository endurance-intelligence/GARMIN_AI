/** Evidence-based workout-type learning. A small, reversible proposal only.
 * Never combine it with another volume correction or alter accepted sessions.
 */
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
export function applyWorkoutToleranceGuidance(days,history,{today,protectedPhase=false,otherAdjustment=false}={}){
 const unchanged={days,appliedDate:null,message:''}
 if(!Array.isArray(days)||!validDate(today)||history?.status!=='ready'||
  protectedPhase||otherAdjustment||!Array.isArray(history.lowIntensityCautionKinds)||
  !Array.isArray(history.workoutTolerance))return unchanged
 const end=new Date(Date.parse(today+'T12:00:00Z')+6*86400000).toISOString().slice(0,10)
 const candidate=[...days].filter(day=>day&&validDate(day.date)&&day.date>=today&&day.date<=end&&
  day.sport==='running'&&day.approvable===true&&!day.decision&&
  ['easy','long'].includes(day.kind)&&history.lowIntensityCautionKinds.includes(day.kind)&&
  Number.isInteger(day.minutes)&&day.minutes> (day.kind==='long'?45:20))
  .sort((a,b)=>a.date.localeCompare(b.date))[0]
 if(!candidate)return unchanged
 const evidence=history.workoutTolerance.find(x=>x.kind===candidate.kind&&x.assessment==='review-low-intensity')
 if(!evidence)return unchanged
 const minutes=Math.max(candidate.kind==='long'?45:20,candidate.minutes-(candidate.kind==='long'?10:5))
 if(minutes>=candidate.minutes)return unchanged
 const message=evidence.hard+' von '+evidence.rated+' bewerteten, zeitlich zugeordneten '+evidence.label+
  '-Einheiten waren sehr hart oder mit schwachem Gefühl, verteilt über '+evidence.hardWeeks+
  ' Wochen. Die geplante Trainingsart beweist nicht die tatsächlich gelaufene Intensität. '+
  'Den nächsten passenden offenen Vorschlag von '+candidate.minutes+' auf '+minutes+
  ' Minuten kürzen und im Sprechtempo bleiben. Nur nach deiner Freigabe.'
 return {days:days.map(day=>day!==candidate?day:{...day,
  kind:candidate.kind==='long'&&minutes<60?'easy':candidate.kind,
  minutes,title:'Coach-Lernschleife · '+minutes+' Min. locker',
  reason:day.reason+' '+message}),appliedDate:candidate.date,message}
}
