import {buildCoachSessionBridge} from './coachSessionBridge.mjs'

const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const duration=s=>{
 const steps=s?.group?.steps
 if(!Array.isArray(steps)||!steps.length)return null
 const all=[s.warmup,...steps,s.cooldown]
 if(all.some(x=>x?.endMode!=='time'||!finite(x.durationSeconds)||x.durationSeconds<=0))return null
 return Math.round(all.reduce((a,x)=>a+x.durationSeconds,0)/60)
}
// Bound the request independently of language/UTF-8 and JSON escaping.
// The ellipsis makes a truncated excerpt visible.
export function boundedCoachReason(value){
 if(typeof value!=='string')return ''
 const text=value.replace(/\s+/g,' ').trim()
 const chars=Array.from(text)
 let out=chars.slice(0,380).join('')
 while(out.length>399||new TextEncoder().encode(JSON.stringify(out+'…')).length>600)
  out=Array.from(out).slice(0,-1).join('')
 return out===text?out:out.trimEnd()+'…'
}
export function buildCoachMemory({today,snapshot}={}){
 const empty={status:'unavailable',historyFrom:null,entries:[],decisions:[],totalEntries:0,totalDecisions:0}
 if(!validDate(today)||!Array.isArray(snapshot?.plans?.entries))return empty
 const historyFrom=validDate(snapshot.plans.historyFrom)?snapshot.plans.historyFrom:null
 const allPlans=snapshot.plans.entries
 const bridge=buildCoachSessionBridge({today,boards:snapshot.boards,plans:allPlans,limit:null})
 const actuals=new Map()
 for(const item of bridge.items){
  if(item.match.status==='matched'&&item.match.plan)
   actuals.set(String(item.match.plan.id),item)
 }
 const covered=d=>Array.isArray(snapshot.boards)&&snapshot.boards.some(b=>
  validDate(b?.start)&&Array.isArray(b.activities)&&d>=b.start&&
  d<=new Date(Date.parse(b.start+'T12:00:00Z')+6*86400000).toISOString().slice(0,10))
 const entries=[]
 const ids=new Set()
 for(const p of allPlans){
  const s=p?.archive_snapshot,d=p?.training_date
  if(s?.sourceKind!=='coach'||!validDate(d)||d>today||!p.id||ids.has(String(p.id))||
   !['draft','pending','confirmed','cancelled'].includes(p.state))continue
  ids.add(String(p.id))
  const actual=['pending','confirmed'].includes(p.state)?actuals.get(String(p.id)):null
  const reason=typeof s.coachReason==='string'&&s.coachReason.trim()?boundedCoachReason(s.coachReason):null
  entries.push({id:String(p.id),date:d,title:String(p.title||s.title||'Coach-Workout'),
   state:p.state,kind:typeof s.coachKind==='string'?s.coachKind:null,
   plannedMinutes:duration(s),reason,
   outcome:actual?'matched':p.state==='draft'?'draft':p.state==='cancelled'?'cancelled':
    bridge.status==='unavailable'||!covered(d)?'unavailable':'unlinked',
   actual:actual?{minutes:actual.durationMinutes,distanceKm:actual.distanceKm,
    rpe:actual.rpe,feeling:actual.feeling}:null})
 }
 entries.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))
 const decisions=[]
 const days=new Set()
 const source=snapshot.life?.context?.day_decisions
 if(Array.isArray(source))for(const d of source){
  if(!validDate(d?.date)||d.date>today||!['accepted','declined'].includes(d.choice)||days.has(d.date))continue
  days.add(d.date)
  decisions.push({date:d.date,choice:d.choice})
 }
 decisions.sort((a,b)=>b.date.localeCompare(a.date))
 return {status:'ready',historyFrom,entries:entries.slice(0,12),decisions:decisions.slice(0,12),
  totalEntries:entries.length,totalDecisions:decisions.length}
}
