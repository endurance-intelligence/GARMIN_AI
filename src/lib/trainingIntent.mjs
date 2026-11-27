/** Planned intent, not observed intensity or retrospective workout quality. */
export function qualityIntent(day,{qualityDay=null,protectedPhase=false}={}){
 if(!day||day.decision==='declined'||['race','illness','blocked','completed','existing','recovery','easy','return_easy','long','mobility','rowing'].includes(day.kind))return null
 if(day.selectedGroup&&day.selectedGroup.advice!=='review')return null
 if(protectedPhase)return null
 if(day.intensityIntent==='hard-option'||(day.date===qualityDay&&day.selectedGroup?.advice==='review'&&/track|intervall|bahn/i.test(day.selectedGroup.title)))return 'candidate'
 if(day.intensityIntent==='quality')return 'planned'
 return null
}
export function savedQualityIntent(plan){
 if(!plan||!['draft','pending','confirmed'].includes(plan.state))return null
 const s=plan.archive_snapshot
 // Only explicit coach workout purpose, never infer from a session name or RPE.
 if(s?.sourceKind==='coach'&&['quality','intervals','tempo','threshold','vo2max','hill_intervals'].includes(s.coachKind))return plan.state==='draft'?'candidate':'planned'
 return null
}
export function qualityPresentation(intent){
 if(intent==='planned')return {label:'Qualitätseinheit',description:'Gezielter Leistungsreiz. Die vorgegebene Intensität und Erholungspausen einhalten; nicht zusätzlich intensiv trainieren.'}
 if(intent==='candidate')return {label:'Qualitätseinheit · Option',description:'Möglicher gezielter intensiver Reiz. Nur nach Prüfung von Trainingsinhalt und Erholung; andernfalls locker trainieren oder auslassen.'}
 return null
}
export function plannedSupplementDays({days=[],plans=[],start,end,today,occupied=new Set()}){
 const result={rowing:new Set(),strength:new Set()}
 const inWeek=d=>typeof d==='string'&&d>=start&&d<=end
 const kind=(sport,title)=>/rowing/i.test(sport)||sport==='other'&&/rudern|rowing/i.test(title)?'rowing':/strength|mobility/i.test(sport)?'strength':null
 const saved=plans.filter(p=>inWeek(p.training_date)&&['draft','pending','confirmed'].includes(p.state))
 for(const p of saved){
  const k=kind(p.sport,p.title)
  if(k)result[k].add(p.training_date)
 }
 for(const d of days){
  if(!inWeek(d.date)||d.date<today||occupied.has(d.date)||d.decision==='declined'||d.selectedGroup||saved.some(p=>p.training_date===d.date))continue
  if(!d.approvable&&d.decision!=='accepted')continue
  const k=d.kind==='rowing'?'rowing':d.kind==='mobility'?'strength':null
  if(k)result[k].add(d.date)
 }
 return {rowingTarget:result.rowing.size||null,strengthTarget:result.strength.size||null}
}

/** Existing explicit quality intent occupies the ISO-week slot even if a draft
 * still awaits approval. Only conditional proposals are suppressed, never a
 * saved workout. A club attendance by itself is not confirmed quality. */
export function protectQualitySlots(days,plans=[],roadmap=[],{today,qualityDay=null}={}){
 const monday=d=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return x.toISOString().slice(0,10)}
 const saved=plans.filter(p=>savedQualityIntent(p)&&typeof p.training_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.training_date)&&Number.isFinite(Date.parse(p.training_date+'T12:00:00Z')))
 return days.map(d=>{
  if(d.date<today||!qualityIntent(d,{qualityDay}))return d
  const start=monday(d.date),week=roadmap.find(w=>w.start===start)
  const occupied=new Set(saved.filter(p=>monday(p.training_date)===start).map(p=>p.training_date))
  if(!occupied.size&&week?.qualityOptions!==0)return d
  const reason=occupied.size?'Eine gespeicherte Qualitätseinheit belegt bereits den Wochenplatz.':'In dieser Trainingsphase ist kein zusätzlicher harter Reiz vorgesehen.'
  const group=d.selectedGroup?.advice==='review'?{...d.selectedGroup,advice:'easy',reason:reason+' Nur locker mitlaufen oder auslassen.'}:d.selectedGroup
  return {...d,intensityIntent:'low-option',qualitySlotBlocked:true,...(group?{selectedGroup:group}:{}),reason:reason+' Nur locker mitlaufen oder auslassen. Keine zweite Qualitätseinheit.'}
 })
}
