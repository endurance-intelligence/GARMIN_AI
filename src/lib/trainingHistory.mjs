/** Durable dated plan snapshots; actuals are read from the existing Garmin archive. */
const DAY=86400000
const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10)
const monday=d=>shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0
export const SPORTS=['running','rowing','strength','cycling','football','hiking','other']
export function sportGroup(s,title=''){
 const v=String(s||'').toLowerCase(),t=String(title||'').toLowerCase()
 if(/run|jog|trail_running|treadmill_running/.test(v))return 'running'
 if(/row/.test(v))return 'rowing'
 if(/strength|weight|mobility|yoga|pilates/.test(v))return 'strength'
 if(/cycl|bik|virtual_ride/.test(v))return 'cycling'
 if(/soccer|football/.test(v))return 'football'
 if(/hik|walk/.test(v))return 'hiking'
 if(v==='other'||!v){
  if(/rudern|rowing/.test(t))return 'rowing'
  if(/stabi|mobility|kraft/.test(t))return 'strength'
  if(/radfahren|rollentrainer|cycling/.test(t))return 'cycling'
  if(/fußball|football/.test(t))return 'football'
  if(/hik|spaziergang/.test(t))return 'hiking'
 }
 return 'other'
}
export function monthBounds(month){
 const start=month+'-01'
 if(!valid(start))return null
 const next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1,12)).toISOString().slice(0,10)
 const end=shift(next,-1),weeks=[]
 for(let d=monday(start);d<=end;d=shift(d,7))weeks.push(d)
 return {start,end,weeks,rangeStart:weeks[0],rangeEnd:shift(weeks.at(-1),6)}
}
export function makePlanSnapshot({budget,days=[],plans=[],options=[],choices=[],today,goalName=null}){
 const start=budget?.start
 if(!valid(start)||monday(start)!==start||!valid(today))return null
 const end=shift(start,6),inWeek=d=>valid(d)&&d>=start&&d<=end
 const entries=[],occupied=new Set()
 for(const p of plans){
  if(!inWeek(p.training_date)||!['draft','pending','confirmed'].includes(p.state))continue
  const kind=sportGroup(p.sport,p.title)
  if(p.sport==='other'&&kind==='other')continue
  const snap=p.archive_snapshot,steps=snap?.group?.steps
  const sec=snap?.sourceKind==='coach'&&Array.isArray(steps)&&steps.length&&steps.every(x=>x.endMode==='time'&&num(x.durationSeconds))&&num(snap.warmup?.durationSeconds)&&num(snap.cooldown?.durationSeconds)?snap.warmup.durationSeconds+snap.cooldown.durationSeconds+steps.reduce((n,x)=>n+x.durationSeconds,0):null
  const minutes=sec!==null?Math.round(sec/60):null
  entries.push({date:p.training_date,kind,title:String(p.title||kind).slice(0,160),minutes,km:kind==='running'&&minutes!==null&&budget.paceSeconds?Math.floor(minutes*60/budget.paceSeconds*10)/10:null,source:p.state==='draft'?'draft':'approved'})
  occupied.add(p.training_date)
 }
 for(const c of choices){
  if(c.choice!=='selected'||!inWeek(c.training_date)||occupied.has(c.training_date))continue
  const o=options.find(x=>x.code===c.option_code)
  if(!o)continue
  const kind=sportGroup(o.sport,o.title)
  entries.push({date:c.training_date,kind,title:String(o.title||kind).slice(0,160),minutes:null,km:null,source:'selected'})
  occupied.add(c.training_date)
 }
 for(const d of days){
  if(!inWeek(d.date)||d.date<today||occupied.has(d.date)||d.decision==='declined'||d.selectedGroup||!d.approvable)continue
  if(!['easy','long','return_easy','mobility','rowing','cycling'].includes(d.kind))continue
  const kind=sportGroup(d.sport,d.title)
  entries.push({date:d.date,kind,title:String(d.title||kind).slice(0,160),minutes:num(d.minutes)?d.minutes:null,km:kind==='running'?budget.proposedParts.find(p=>p.date===d.date)?.km??null:null,source:'coach'})
  occupied.add(d.date)
 }
 return {schema:1,weekStart:start,phase:String(budget.phaseLabel||'').slice(0,100),goalName:typeof goalName==='string'?goalName.slice(0,160):null,target:budget.target,entries:entries.sort((a,b)=>a.date.localeCompare(b.date)),partial:today>start}
}
export function collectActual(activities=[],manual=[],today){
 const result=[],seen=new Set()
 for(const a of activities){
  const date=String(a.start_time_local||'').slice(0,10),id=a.activity_id==null?'':String(a.activity_id)
  if(!id||seen.has(id)||!valid(date)||date>today)continue
  seen.add(id)
  const kind=sportGroup(a.sport_type)
  result.push({date,kind,title:String(a.activity_name||kind),minutes:num(a.duration_s)?a.duration_s/60:null,km:kind==='running'&&num(a.distance_m)?a.distance_m/1000:null,source:'Garmin'})
 }
 const manualSeen=new Set()
 for(const a of manual){
  const date=a.session_date,id=a.id==null?'':String(a.id),kind=sportGroup(a.kind)
  if(!id||manualSeen.has(id)||!valid(date)||date>today)continue
  manualSeen.add(id)
  // A same-kind manual log close in duration is likely a duplicate. Match at most once.
  const match=result.find(r=>r.source==='Garmin'&&!r.manualMatched&&r.date===date&&r.kind===kind&&num(r.minutes)&&num(a.duration_minutes)&&Math.abs(r.minutes-a.duration_minutes)<=5)
  if(match){match.manualMatched=true;continue}
  result.push({date,kind,title:kind,minutes:num(a.duration_minutes)?a.duration_minutes:null,km:null,source:'manual'})
 }
 return result
}
export function summarizeEntries(entries,start,end){
 const subset=entries.filter(e=>e.date>=start&&e.date<=end)
 const rows=SPORTS.map(kind=>{
  const a=subset.filter(e=>e.kind===kind)
  return {kind,count:a.length,minutes:a.every(x=>num(x.minutes))?Math.round(a.reduce((n,x)=>n+x.minutes,0)):null,km:kind==='running'&&a.every(x=>num(x.km))?Math.round(a.reduce((n,x)=>n+x.km,0)*10)/10:null}
 })
 return {rows,total:subset.length,minutes:subset.every(x=>num(x.minutes))?Math.round(subset.reduce((n,x)=>n+x.minutes,0)):null,runKm:rows[0].km}
}
export function historyModel({month,activities=[],manual=[],revisions=[],today}){
 const bounds=monthBounds(month)
 if(!bounds)return null
 const actual=collectActual(activities,manual,today)
 const weeks=bounds.weeks.map(start=>{
  const end=shift(start,6)
  const versions=revisions.filter(x=>x.week_start===start).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)))
  const first=versions[0]||null,last=versions.at(-1)||null
  return {start,end,first,last,versions:versions.length,actual:summarizeEntries(actual,start,end),original:first?summarizeEntries(first.snapshot.entries,start,end):null,planned:last?summarizeEntries(last.snapshot.entries,start,end):null}
 })
 const firstEntries=weeks.flatMap(w=>w.first?.snapshot.entries||[]),lastEntries=weeks.flatMap(w=>w.last?.snapshot.entries||[])
 return {bounds,weeks,actual:summarizeEntries(actual,bounds.start,bounds.end),original:summarizeEntries(firstEntries,bounds.start,bounds.end),planned:summarizeEntries(lastEntries,bounds.start,bounds.end),savedWeeks:weeks.filter(w=>w.last).length}
}
