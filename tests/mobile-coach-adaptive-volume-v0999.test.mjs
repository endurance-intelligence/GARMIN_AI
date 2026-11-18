import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeAdaptiveVolume,applyAdaptiveVolume} from '../src/lib/coachAdaptiveVolume.mjs'
import {analyzeCoachFourWeeks} from '../src/lib/coachFourWeeks.mjs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-18'
const days=['2026-11-09','2026-11-02','2026-10-26','2026-10-19']
const dates=['2026-11-10','2026-11-03','2026-10-27','2026-10-20']
const goal={race_date:'2027-04-25',race_name:'Hermannslauf',distance_km:31.1}
const week=(distance=40,longest=75)=>({
 available:true,distanceKm:distance,runs:4,longestRunMinutes:longest
})
const history=(arr=[40,39,42,41],long=[75,70,70,65],nRated=8)=>({
 weeks:arr.map((km,i)=>week(km,long[i])),
 totalRated:nRated,qualityCaution:false
})
const assess=(h=history(),extra={})=>
 analyzeAdaptiveVolume({today,history:h,goal,...extra})
const long=(date='2026-11-22',mod={})=>({
 date,kind:'long',sport:'running',title:'Langer Lauf · 65 Min.',
 minutes:65,approvable:true,reason:'Unter LT1',...mod
})
test('four steady measured weeks, real long sessions and Garmin feedback permit +5 min ONLY as proposal',()=>{
 const r=assess()
 assert.equal(r.status,'progress')
 assert.equal(r.changeMinutes,5)
 assert.equal(r.weeksUsed,4)
 assert.equal(r.latestKm,40)
 assert.equal(r.baselineKm,40.5)
 const accepted=long('2026-11-19',{kind:'existing',approvable:false,title:'Saved long run'})
 const open=long()
 const after=applyAdaptiveVolume([accepted,open,long('2026-11-23')],r,{today})
 assert.equal(after.effect,'progress')
 assert.equal(after.appliedDate,'2026-11-22')
 assert.equal(after.days[0],accepted)
 assert.equal(after.days[1].minutes,70)
 assert.equal(after.days[1].approvable,true)
 assert.match(after.days[1].reason,/Freigabe/)
 assert.equal(after.days[2].minutes,65)
})
test('a training spike in latest complete week recommends reducing only an open long run',()=>{
 const r=assess(history([62,39,42,41]))
 assert.equal(r.status,'reduce')
 assert.equal(r.changeMinutes,-15)
 assert.match(r.title,/Umfang/)
 const result=applyAdaptiveVolume([long()],r,{today})
 assert.equal(result.effect,'reduced')
 assert.equal(result.days[0].minutes,50)
 assert.equal(result.days[0].kind,'easy')
})
test('a reduced last week is never treated as missed mileage to be caught up',()=>{
 const r=assess(history([15,39,42,41]))
 assert.equal(r.status,'reduce')
 assert.match(r.reason,/Nicht versuchen, ausgefallene Kilometer nachzuholen/)
 assert.equal(applyAdaptiveVolume([long()],r,{today}).days[0].minutes,50)
})
test('all training progress is protected in days before a goal race and two weeks after',()=>{
 const before=assess(history(),{goal:{race_date:'2026-11-21',race_name:'Heartbeat Ultra Fulda'}})
 assert.equal(before.status,'protected')
 assert.match(before.reason,/3 Tage/)
 assert.equal(applyAdaptiveVolume([long()],before,{today}).effect,'none')
 const recovery=analyzeAdaptiveVolume({today:'2026-11-26',history:history(),
  goal:{race_date:'2026-11-21',race_name:'Heartbeat Ultra Fulda'}})
 assert.equal(recovery.status,'protected')
 assert.match(recovery.reason,/Erholung/)
 const tap=assess(history(),{goal:{race_date:'2026-12-01'}})
 assert.equal(tap.status,'protected')
})
test('illness, symptoms, bad Garmin feedback, big uncertainty or another adjustment block increasing or reducing',()=>{
 for(const flag of ['ill','returning','postIllness','symptoms','caution',
  'feedbackCaution','trendReducing','trendShortening']){
  const r=assess(history(),{[flag]:true})
  assert.equal(r.status,'protected',flag)
 }
 assert.equal(assess({...history(),qualityCaution:true}).status,'protected')
 assert.equal(assess(history(),{recentImpactEffect:'shortened'}).status,'protected')
 assert.equal(assess(history(),{observationLimited:true}).status,'maintain')
})
test('missing, unmeasured or sparse weeks never imply zeros or progression',()=>{
 assert.equal(assess({...history(),weeks:history().weeks.slice(0,2)}).status,'insufficient')
 assert.equal(assess({...history(),weeks:history().weeks.map((w,i)=>
  i===1?{...w,available:false,distanceKm:null}:w)}).status,'insufficient')
 assert.equal(assess({...history(),weeks:history().weeks.map(w=>({...w,
  longestRunMinutes:null}))}).status,'maintain')
 assert.equal(assess(history([40,39,42,41],[75,70,70,65],0)).status,'maintain')
 assert.equal(assess(history([40,39,42,41],[75,70,70,65],8),{observationLimited:true}).status,'maintain')
 assert.equal(assess(history([10,9,8,9])).status,'insufficient')
})
test('choppy volumes cannot trigger optimistic +5min even with Garmin RPE',()=>{
 const r=assess(history([38,30,56,34]))
 assert.equal(r.status,'maintain')
 const b=assess(history([40,39,42,41],[75,45,75,70]))
 assert.equal(b.status,'maintain')
 const c=assess(history([40,39,42,41],[75,70,75,70],8),{caution:true})
 assert.equal(c.status,'protected')
})
test('no changes to an already approved, selected, completed, declined or out-of-window day',()=>{
 const allowed=assess()
 const data=[
  long('2026-11-20',{kind:'existing',approvable:false}),
  long('2026-11-21',{kind:'race'}),
  long('2026-11-22',{decision:'accepted'}),
  long('2026-11-23',{decision:'declined'}),
  long('2026-11-24',{kind:'completed',approvable:false}),
  long('2026-11-25',{kind:'chosen',approvable:false}),
  long('2026-11-26'),
  long('2026-11-15')
 ]
 const copy=JSON.stringify(data)
 const after=applyAdaptiveVolume(data,allowed,{today})
 assert.equal(after.effect,'none')
 assert.equal(JSON.stringify(after.days),copy)
})
test('only future long run, never same-day easy/mobility/choice, is revised',()=>{
 const state=assess()
 const source=[long('2026-11-20',{kind:'easy'}),long('2026-11-21',{kind:'mobility'}),
  long('2026-11-22',{approvable:false}),long('2026-11-23')]
 const altered=applyAdaptiveVolume(source,state,{today})
 assert.equal(altered.days[0].minutes,65)
 assert.equal(altered.days[1].minutes,65)
 assert.equal(altered.days[2].minutes,65)
 assert.equal(altered.days[3].minutes,70)
})
test('real Garmin history includes measured longest duration without changing deduplication',()=>{
 const boards=days.map((start,i)=>({start,activities:[
  {activity_id:'a'+i,start_time_local:dates[i]+' 19:00:00',sport_type:'running',
   duration_s:4200,distance_m:12000,rpe_raw:55,feeling_raw:75},
  {activity_id:'b'+i,start_time_local:start+' 09:00:00',sport_type:'running',
   duration_s:2400,distance_m:8000,rpe_raw:55,feeling_raw:75}
 ]}))
 const r=analyzeCoachFourWeeks({today,boards,plans:{entries:[],historyFrom:'2026-10-01'},
  life:{context:{day_decisions:[]}}})
 assert.equal(r.weeks[0].distanceKm,20)
 assert.equal(r.weeks[0].longestRunMinutes,70)
 assert.equal(r.weeks[1].longestRunMinutes,70)
 assert.equal(r.totalRuns,8)
})
test('actual 7-day Coach applies one adaptive long-run proposal after safety filters',()=>{
 const boards=days.map((start,i)=>({start,activities:[
  {activity_id:'a'+i,start_time_local:dates[i]+' 19:00:00',
   sport_type:'running',duration_s:4500,distance_m:25000,rpe_raw:50,feeling_raw:75},
  {activity_id:'b'+i,start_time_local:start+' 07:00:00',
   sport_type:'running',duration_s:3900,distance_m:15000,rpe_raw:50,feeling_raw:75}
 ]}))
 const r=buildSevenDayCoach({today,boards,plans:{entries:[],historyFrom:'2026-10-01'},
  life:{context:{illness_state:'well',blocked_periods:[],day_decisions:[],run_reviews:[],
    race_recovery_checks:[],post_workout_feedback:[]},runs:[]},
  options:{options:[],choices:[]},goal:{goal},
  health:{training:{runKm7:42,previousRunKm7:40,historyStatus:'complete',truncated:false},
   metrics:Array.from({length:18},(_,i)=>({metric_date:'2026-11-'+String(i+1).padStart(2,'0'),
    hrv_ms:50,resting_heart_rate:43,sleep_seconds:27000}))}
 })
 assert.equal(r.adaptiveVolume.status,'progress')
 const longDay=r.days.find(x=>x.date==='2026-11-22')
 assert.equal(longDay.minutes,70)
 assert.match(longDay.reason,/Nur nach deiner Freigabe/)
 assert.equal(longDay.approvable,true)
 assert.equal(r.adaptiveVolume.appliedDate,longDay.date)
})
test('new Coach module is read only and daily approvals remain the only write path',()=>{
 const m=read('src/lib/coachAdaptiveVolume.mjs')
 const coach=read('src/lib/coachSevenDay.mjs')
 const ui=read('src/components/CoachSevenDay.tsx')
 const card=read('src/components/CoachAdaptiveVolumeCard.tsx')
 assert.match(coach,/applyAdaptiveVolume\(adapted.days,volume,\{today\}\)/)
 assert.match(coach,/adaptiveVolume:\{\.\.\.volume,appliedDate:volumeStep.appliedDate\}/)
 assert.match(ui,/<CoachAdaptiveVolumeCard review=\{plan.adaptiveVolume\}/)
 assert.match(card,/keine Intensitätszonen und kein Fitness-Score/)
 assert.doesNotMatch(m,/fetch\(|\.upsert\(|\.insert\(|postToGarmin|approveWorkout/)
})
