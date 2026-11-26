/** Recurring preferences are not appointments or medical clearance. */
export const DEFAULT_RHYTHM={rowing:{days:[4],minutes:30},strength:{days:[5],minutes:30}}
export const RHYTHM_KEY='garmin-ai-training-rhythm-v1'
export function normalizeRhythm(value){
 if(!value||typeof value!=='object')return null
 const out={}
 for(const key of ['rowing','strength']){
  const p=value[key]
  if(!p||!Array.isArray(p.days)||p.days.some(d=>!Number.isInteger(d)||d<1||d>7)||new Set(p.days).size!==p.days.length||![15,20,30,45,60].includes(p.minutes))return null
  out[key]={days:[...p.days].sort((a,b)=>a-b),minutes:p.minutes}
 }
 return out
}
export function readRhythm(){
 try{return normalizeRhythm(JSON.parse(localStorage.getItem(RHYTHM_KEY)||'null'))||DEFAULT_RHYTHM}catch{return DEFAULT_RHYTHM}
}
export function saveRhythm(value){
 const result=normalizeRhythm(value)
 if(!result)throw Error('Ungültiger Trainingsrhythmus.')
 localStorage.setItem(RHYTHM_KEY,JSON.stringify(result))
 return result
}
const dayNumber=d=>new Date(d+'T12:00:00Z').getUTCDay()||7
const plus=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const label={rowing:'Rudern',strength:'Stabi & Mobility'}
/** A preference can replace an open easy/free slot, never add a second session. */
export function applyTrainingRhythm(days,rhythm,{today,protectedPhase=false,qualityDay=null,evidence=[],equipment=null,options=[],choices=[]}={}){
 const config=normalizeRhythm(rhythm)
 if(!config)return days
 const available=equipment?.available
 return days.map(day=>{
  if(day.date<today)return day
  const wanted=['rowing','strength'].filter(k=>config[k].days.includes(dayNumber(day.date)))
  if(!wanted.length)return day
  const entries=wanted.map(kind=>({kind,title:label[kind],minutes:config[kind].minutes,status:'paused',reason:'Regeneration und aktuelle Coach-Empfehlung haben Vorrang.'}))
  for(const e of entries){
   if(evidence.some(r=>r.date===day.date&&(r.kind===e.kind||(e.kind==='strength'&&r.kind==='mobility')))){
    e.status='done';e.reason='Absolvierte Einheit erkannt.'
   }
  }
  const annotate=()=>({...day,rhythm:entries})
  const open=entries.filter(e=>e.status!=='done')
  if(!open.length)return annotate()
  if(day.decision||day.selectedGroup||['race','illness','blocked','existing','completed','chosen','option','return_easy','long'].includes(day.kind)){
   for(const e of open)e.reason=day.decision?'Deine Tagesentscheidung bleibt bestehen.':day.kind==='completed'?'Heute bereits trainiert – keine zweite Einheit.':'Vorhandene Termine oder Schutzphase haben Vorrang.'
   return annotate()
  }
  if(protectedPhase||day.date===qualityDay||day.intensityIntent==='hard-option'||evidence.some(r=>r.date>=plus(day.date,-1)&&r.date<=day.date&&['rowing','strength','football'].includes(r.kind)&&(r.kind==='football'||r.rpe>=7)))return annotate()
  if(!['easy','mobility','recovery'].includes(day.kind)||day.kind==='recovery'&&day.title!=='Erholung / freier Tag')return annotate()
  if(day.kind==='mobility'&&/Rumpfstabi|nach dem Wettkampf/.test(day.title))return annotate()
  const nextDemanding=days.some(d=>d.date===plus(day.date,1)&&(d.kind==='long'||d.kind==='race'||d.kind==='existing'||d.intensityIntent==='hard-option'||!!d.selectedGroup))||
   options.some(o=>o.enabled&&o.weekday===dayNumber(plus(day.date,1))&&/track|intervall|football|fußball/i.test(o.title||'')&&!choices.some(c=>c.option_code===o.code&&c.training_date===plus(day.date,1)&&c.choice==='skipped'))
  const candidate=open.find(e=>!Array.isArray(available)||available.includes(e.kind==='rowing'?'rowing':'bodyweight'))
  if(!candidate){for(const e of open)e.reason='Benötigte Ausrüstung nicht im Profil bestätigt.';return annotate()}
  const minutes=Math.min(candidate.minutes,nextDemanding?20:30,day.kind==='easy'&&day.minutes?day.minutes:60)
  candidate.status='suggested';candidate.reason=minutes<candidate.minutes?'Verkürzt, damit die weitere Wochenbelastung passt.':'Wunschtag berücksichtigt.'
  for(const e of open.filter(x=>x!==candidate))e.reason='Nur eine Einheit an diesem Tag vorgeschlagen.'
  const rowing=candidate.kind==='rowing'
  return {...day,rhythm:entries,kind:rowing?'rowing':'mobility',sport:rowing?'other':'strength',approvable:true,minutes,title:label[candidate.kind]+' · '+minutes+' Min.',reason:(rowing?'Lockeres Rudern im Sprechtempo, ohne Widerstandsspitzen. Aerober Reiz statt zusätzlicher Laufkilometer.':'Leichte bis moderate Rumpf- und Hüftstabilität, Beweglichkeit; keine Ausbelastung oder schweren Beinübungen.')+' '+(nextDemanding?'Vor dem nächsten potenziell intensiven Termin besonders leicht bleiben. ':'')+'Nur dieser Vorschlag, keine zusätzliche Einheit und kein Nachholen.',intensityIntent:rowing?'low':undefined}
 })
}
