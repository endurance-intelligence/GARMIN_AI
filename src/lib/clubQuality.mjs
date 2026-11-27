/** Personal ORC rhythm: actual, saved, selected and open commitments are
 * distinct. Never assume attendance from a weekday or unknown Garmin run. */
import {normalizeGarminRpe,normalizeGarminFeeling} from './garminPerception.mjs'
import {savedQualityIntent} from './trainingIntent.mjs'
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const monday=d=>shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const date=a=>String(a.start_time_local||'').slice(0,10)
const finite=n=>typeof n==='number'&&Number.isFinite(n)
export const isOrcTrack=o=>o?.enabled===true&&o.sport==='running'&&/^orc-track-(tue|sat)$/.test(o.code)&&[2,6].includes(o.weekday)
export const isTrackActivity=a=>/run|track|trail/i.test(String(a.sport_type||''))&&/orc\s*track|intervall/i.test(String(a.activity_name||''))
export function clubQualityWeek({today,start=monday(today),options=[],choices=[],days=[],boards=[],plans=[]}){
 const slots=options.filter(isOrcTrack).sort((a,b)=>a.weekday-b.weekday)
 if(!slots.length)return null
 const end=shift(start,6),activities=boards.flatMap(b=>b.activities||[])
 const actualDates=new Set(activities.filter(a=>date(a)>=start&&date(a)<=end&&date(a)<=today&&(isTrackActivity(a)||a.sport_type==='track_running'&&slots.some(o=>shift(start,o.weekday-1)===date(a)&&choices.some(c=>c.option_code===o.code&&c.training_date===date(a)&&c.choice==='selected')))).map(date))
 const savedDates=new Set(plans.filter(p=>p.training_date>=start&&p.training_date<=end&&savedQualityIntent(p)).map(p=>p.training_date))
 const sessions=slots.map(o=>{
  const d=shift(start,o.weekday-1),choice=choices.find(c=>c.option_code===o.code&&c.training_date===d)?.choice
  const recommendation=days.find(x=>x.date===d)
  const status=actualDates.has(d)?'completed':savedDates.has(d)?'saved':d<today?(choice==='skipped'?'skipped':'past-unknown'):choice==='skipped'?'skipped':recommendation?.kind==='blocked'?'unavailable':choice==='selected'?'selected':'open'
  return {date:d,code:o.code,status,protected:!!recommendation&&['illness','blocked','race','recovery'].includes(recommendation.kind)}
 })
 const reserved=new Set([...actualDates,...savedDates,...sessions.filter(s=>['open','selected','past-unknown'].includes(s.status)).map(s=>s.date)])
 return {start,end,slots:sessions,actual:actualDates.size,saved:savedDates.size,actualDates:[...actualDates],savedDates:[...savedDates],reserved:reserved.size,occupiedDates:[...new Set([...actualDates,...savedDates])],
  bothSkipped:sessions.length===2&&sessions.every(s=>['skipped','unavailable'].includes(s.status))&&actualDates.size===0&&savedDates.size===0}
}
/** Count original trainer distance only, never an inferred drill/cooldown.
 * Keep the archive unchanged; exact distance-controlled derivative is separate. */
export function archiveGroupSpec(template,groupName){
 const w=template?.workout,g=w?.groups?.find(x=>x.name===groupName)
 if(!g||!w.warmup||!w.cooldown||!Array.isArray(g.steps)||g.steps.length<3||g.steps.length>48)return null
 const steps=[{...w.warmup,kind:'warmup'},...g.steps,{...w.cooldown,kind:'cooldown'}]
 if(steps.some(s=>!['warmup','cooldown','run','recovery'].includes(s.kind)||!Number.isSafeInteger(s.distanceMeters)||s.distanceMeters<20||s.distanceMeters>20000||s.paceSecondsPerKm!=null&&(!Number.isInteger(s.paceSecondsPerKm)||s.paceSecondsPerKm<120||s.paceSecondsPerKm>900)))return null
 const efforts=steps.filter(s=>s.kind==='run'),recovery=steps.filter(s=>s.kind==='recovery')
 if(efforts.length<2||!recovery.length||efforts.some(s=>s.distanceMeters>2000)||steps[0].distanceMeters<1000||steps.at(-1).distanceMeters<1000)return null
 const sum=xs=>xs.reduce((n,s)=>n+s.distanceMeters,0)
 const effortMeters=sum(efforts),totalMeters=sum(steps)
 if(effortMeters>8000||totalMeters>18000||effortMeters/totalMeters>.65)return null
 return {templateId:template.id,group:g.name,title:String(template.title||w.title).slice(0,90),coachName:w.trainer||'',sourceLabel:w.sourceLabel||'',efforts:efforts.length,effortMeters,recoveryMeters:sum(recovery),totalMeters,warmupMeters:steps[0].distanceMeters,cooldownMeters:steps.at(-1).distanceMeters,
  steps:steps.map(s=>({kind:s.kind,distanceMeters:s.distanceMeters,durationSeconds:null,paceSecondsPerKm:s.paceSecondsPerKm??null,notes:s.notes||'',endMode:'distance'}))}
}
/** Only reuse a previously personally selected archive group with a matching
 * completed and reasonably tolerated Track activity. A poster alone does not
 * tell us which pace group the athlete belongs to. */
export function selectArchiveQuality({today,archive=[],plans=[],boards=[],budget,replaceDate,freeSlot=false}){
 if(!Array.isArray(archive)||!budget?.target||!finite(budget.forecastKm)||!finite(budget.paceSeconds))return null
 const actual=boards.flatMap(b=>b.activities||[]).filter(a=>isTrackActivity(a)&&date(a)<today&&date(a)>=shift(today,-28)&&finite(a.distance_m)&&normalizeGarminRpe(a.rpe_raw)!==null&&normalizeGarminRpe(a.rpe_raw)<=7&&(normalizeGarminFeeling(a.feeling_raw)===null||normalizeGarminFeeling(a.feeling_raw)>=50))
 const prior=plans.flatMap(p=>{
  if(!['pending','confirmed'].includes(p.state)||p.training_date>=today||!p.archive_workout_id||!p.archive_group)return []
  const source=archive.find(a=>a.id===p.archive_workout_id),spec=archiveGroupSpec(source,p.archive_group)
  if(!spec)return []
  const match=actual.find(a=>date(a)===p.training_date&&Math.abs(a.distance_m-spec.totalMeters)<=Math.max(1000,spec.totalMeters*.15))
  return match?[{spec,match}]:[]
 })
 // A newly uploaded historic single-group template (or explicitly named
 // group) may also match a rated Garmin workout without a former calendar draft.
 const words=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
 for(const t of archive){
  const title=words(t.title||t.workout?.title)
  if(title.length<5)continue
  for(const g of t.workout?.groups||[]){
   const spec=archiveGroupSpec(t,g.name),name=words(g.name)
   if(!spec)continue
   const match=actual.find(a=>(' '+words(a.activity_name)+' ').includes(' '+title+' ')&&(t.workout.groups.length===1||name.length>=2&&(' '+words(a.activity_name)+' ').includes(' '+name+' '))&&Math.abs(a.distance_m-spec.totalMeters)<=Math.max(1000,spec.totalMeters*.15))
   if(match)prior.push({spec,match})
  }
 }
 if(!prior.length)return null
 const removed=freeSlot?0:budget.proposedParts?.find(p=>p.date===replaceDate)?.km
 if(!finite(removed))return null
 const candidates=archive.flatMap(t=>t.workout?.groups?.flatMap(g=>{
  const s=archiveGroupSpec(t,g.name)
  if(!s||budget.forecastKm-removed+s.totalMeters/1000>budget.target.high)return []
  const known=prior.find(({spec,match})=>spec.group===s.group&&s.totalMeters<=Math.min(spec.totalMeters,match.distance_m)&&s.effortMeters<=spec.effortMeters&&Math.max(...s.steps.filter(x=>x.kind==='run').map(x=>x.distanceMeters))<=Math.max(...spec.steps.filter(x=>x.kind==='run').map(x=>x.distanceMeters))&&s.recoveryMeters/s.effortMeters>=spec.recoveryMeters/spec.effortMeters*.9&&s.steps.filter(x=>x.kind==='run').every(x=>x.paceSecondsPerKm==null||spec.steps.filter(y=>y.kind==='run').every(y=>y.paceSecondsPerKm!=null&&x.paceSecondsPerKm>=y.paceSecondsPerKm)))
  return known?[s]:[]
 })||[])
 return candidates.sort((a,b)=>a.effortMeters-b.effortMeters||a.totalMeters-b.totalMeters||String(a.templateId).localeCompare(String(b.templateId)))[0]||null
}

/** Personal replacement: only when both recurring track opportunities are
 * explicitly unavailable, not simply because a choice hasn't been made. */
export function proposeClubReplacement(days,{today,week,boards=[],plans=[],archive=[],roadmap=[],budget,protectedPhase=false,volumeStatus}={}){
 if(!week?.bothSkipped||protectedPhase||!['maintain','progress'].includes(volumeStatus)||!budget?.target||!finite(budget.paceSeconds)||!finite(budget.forecastKm)||budget.forecastKm>budget.target.high||!(roadmap.find(w=>w.start===week.start)?.qualityOptions>=1))return {days,date:null}
 const actual=boards.flatMap(b=>b.activities||[]).filter(a=>date(a)<=today&&date(a)>=shift(today,-6))
 const easyActual=new Set(actual.filter(a=>/run|trail/i.test(a.sport_type||'')&&a.duration_s>=1200&&normalizeGarminRpe(a.rpe_raw)!==null&&normalizeGarminRpe(a.rpe_raw)<=4&&!isTrackActivity(a)).map(date))
 const easy=d=>d.kind==='easy'&&d.sport==='running'&&d.approvable&&!d.decision&&!d.selectedGroup&&d.intensityIntent==='low'
 const free=d=>d.kind==='recovery'&&d.title==='Erholung / freier Tag'&&!d.decision&&!d.selectedGroup&&!d.rhythm?.some(r=>r.status==='suggested')
 const otherEasy=d=>easy(d)||d.kind==='long'&&d.approvable&&d.intensityIntent==='low'&&!d.decision||d.selectedGroup?.code==='orc-run-wed'&&d.selectedGroup.advice!=='skip'
 const candidate=days.filter(d=>(easy(d)&&d.minutes>=30||free(d))&&d.date>=today&&d.date<=week.end&&
   new Set([...easyActual,...days.filter(x=>x.date!==d.date&&x.date>=today&&x.date<=week.end&&otherEasy(x)).map(x=>x.date)].filter(x=>x!==d.date)).size>=2&&
   !actual.some(a=>date(a)>=shift(d.date,-1)&&date(a)<=d.date&&(/football|soccer/i.test(a.sport_type)||normalizeGarminRpe(a.rpe_raw)>=7||isTrackActivity(a)))&&
   !days.some(x=>Math.abs(Date.parse(x.date+'T12:00:00Z')-Date.parse(d.date+'T12:00:00Z'))===86400000&&
    (['long','race','existing'].includes(x.kind)||x.selectedGroup||x.kind==='option'&&/track|intervall|bahn|football|fußball/i.test(x.title))))
  .sort((a,b)=>Number(free(a))-Number(free(b))||Number(week.slots.some(s=>s.date===a.date))-Number(week.slots.some(s=>s.date===b.date))||a.date.localeCompare(b.date))[0]
 if(!candidate)return {days,date:null}
 const spec=selectArchiveQuality({today,archive,plans,boards,budget,replaceDate:candidate.date,freeSlot:free(candidate)})
 const removed=free(candidate)?0:budget.proposedParts?.find(p=>p.date===candidate.date)?.km
 if(!spec&&(!finite(removed)||budget.forecastKm-removed+36*60/budget.paceSeconds>budget.target.high))return {days,date:null}
 const title=spec?'Archiv · '+spec.title+' · '+spec.group:'Qualität · 4 × 2 Min. kontrollierte Intervalle'
 const reason=spec?'Beide ORC-Track-Termine entfallen. Passende geprüfte Vorlage aus deiner Trainingsbibliothek mit belegter Gruppenverträglichkeit: '+spec.warmupMeters/1000+' km einlaufen, '+spec.efforts+' Intervalle ('+spec.effortMeters/1000+' km), '+spec.recoveryMeters/1000+' km Trabpausen, '+spec.cooldownMeters/1000+' km auslaufen. Gesamt '+spec.totalMeters/1000+' km.':'Beide ORC-Track-Termine entfallen. Noch keine passende vollständig belegte Archivgruppe; konservativer Ersatz: 12 Min. einlaufen, 4 × 2 Min. kontrolliert zügig, 3 × 2 Min. traben, 10 Min. auslaufen.'
 return {date:candidate.date,days:days.map(d=>d===candidate?{...d,kind:'intervals',title,minutes:spec?null:36,approvable:true,intensityIntent:'hard-option',...(spec?{qualityArchive:spec}:{}),reason:reason+' Nur gut erholt und beschwerdefrei; kein Nachholen ausgefallener Kilometer, deine Freigabe bleibt erforderlich.'}:d)}
}
export function buildArchiveQualitySnapshot(spec,startTime){
 if(!spec||!Array.isArray(spec.steps)||! /^(0[5-9]|1[0-9]|2[0-2]):(00|15|30|45)$/.test(startTime))return null
 return {schemaVersion:1,sourceKind:'coach',coachKind:'intervals',qualitySource:'archive',templateId:spec.templateId,title:('Archiv · '+spec.title+' · '+spec.group).slice(0,120),coachName:spec.coachName,sourceLabel:spec.sourceLabel,startTime,group:{name:spec.group,notes:'Geprüfte Archivvorlage · kontrollierte Belastung',steps:spec.steps.slice(1,-1)},warmup:spec.steps[0],cooldown:spec.steps.at(-1)}
}
export function archiveSnapshotMeters(s){
 if(s?.qualitySource!=='archive'||s.sourceKind!=='coach'||s.coachKind!=='intervals'||!Array.isArray(s.group?.steps))return null
 const steps=[s.warmup,...s.group.steps,s.cooldown]
 return steps.length<=50&&steps.every(x=>x?.endMode==='distance'&&Number.isSafeInteger(x.distanceMeters)&&x.distanceMeters>0)?steps.reduce((n,x)=>n+x.distanceMeters,0):null
}

/** A selected ORC track is an explicit intended interval day, not proof
 * of execution. Capacity is per ISO week and can fall to zero in protection. */
export function applyClubQuality(days,{today,weeks=[],roadmap=[],protectedPhase=false,boards=[]}={}){
 const recent=boards.flatMap(b=>b.activities||[]).filter(a=>date(a)<=today)
 const result=[...days]
 for(const w of weeks.filter(Boolean)){
  const limit=protectedPhase?0:roadmap.find(x=>x.start===w.start)?.qualityOptions??0
  const occupied=new Set(w.occupiedDates)
  const candidates=w.slots.filter(s=>s.date>=today&&['selected','open'].includes(s.status)).sort((a,b)=>Number(b.status==='selected')-Number(a.status==='selected')||a.date.localeCompare(b.date))
  for(const slot of candidates){
   const i=result.findIndex(d=>d.date===slot.date)
   if(i<0)continue
   const d=result[i],selected=slot.status==='selected'
   // The existing recovery/health advice takes priority; do not erase it.
   const group=d.selectedGroup
   const previousHard=recent.some(a=>date(a)===shift(slot.date,-1)&&(normalizeGarminRpe(a.rpe_raw)>=8||isTrackActivity(a)))
   const blocked=protectedPhase||occupied.size>=limit||slot.protected||previousHard||d.decision==='declined'||(selected&&group?.advice!=='review')||!selected&&d.kind!=='option'
   if(!blocked)occupied.add(slot.date)
   const reason=blocked?'ORC Track ist ein vorgesehener Qualitätsreiz. Heute spricht die Erholungs-/Wochenplanung gegen zusätzliche Intensität.':'Regulärer ORC-Qualitätstermin: '+(selected?'Teilnahme bestätigt.':'Teilnahme noch offen.')+' Die Originalvorgaben des Trainers zählen als Intervalle; keine zusätzlichen Intervalle einplanen. Intensität nach Tagesform, Fußballbelastung und Verträglichkeit prüfen.'
   const amendedGroup=group&&blocked&&group.advice==='review'?{...group,advice:'easy',reason:reason+' Nur locker teilnehmen oder auslassen.'}:group
   result[i]={...d,clubQualitySlot:true,intensityIntent:blocked?'low-option':'hard-option',...(selected?{qualityIntent:'planned',qualityBlocked:blocked}:blocked?{qualityIntent:undefined}:{qualityIntent:'candidate',qualityBlocked:false}),...(amendedGroup?{selectedGroup:amendedGroup}:{}),reason:blocked?d.reason+' '+reason:reason}
  }
 }
 return result
}
