import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {completedLoadActivities,activityLoadComparison,weekLoadComparison,loadCoachFinding,shiftDay} from '../supabase/functions/garmin-intervals-insights/loadComparison.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const mk=(date,load,id,type='Run',time='09:00:00',distance=10000)=>({
 id:String(id),type,start_date_local:date+'T'+time,distance,icu_training_load:load
})
test('97 training load is compared with own previous running sessions, not universal points',()=>{
 const target='2026-11-14'
 const days=[1,4,8,15,22,29,39,48]
 const loads=[55,65,70,75,50,60,80,65]
 const history=days.map((n,i)=>mk(shiftDay(target,-n),loads[i],'r'+i))
 const result=activityLoadComparison([...history,mk(target,97,'current')],97,target)
 assert.equal(result.available,true)
 assert.equal(result.load,97)
 assert.equal(result.median,65)
 assert.equal(result.count,8)
 assert.equal(result.category,'higher')
 assert.equal(result.higherThan,8)
 assert.equal(result.windowDays,56)
 const coach=loadCoachFinding(result,'activity',{race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21'},target)
 assert.match(coach.text,/über deinem bisherigen Vergleichswert/)
 assert.match(coach.text,/Wettkampf in 7 Tagen/)
 assert.match(coach.text,/keine ausgefallenen Kilometer/)
 assert.notEqual(coach.category,'usual')
})
test('short or fragmented history is unknown, never labelled low or high',()=>{
 const history=[mk('2026-11-10',40,'a'),mk('2026-11-11',50,'b'),
  mk('2026-11-12',60,'c'),mk('2026-11-13',70,'d')]
 const result=activityLoadComparison(history,97,'2026-11-14')
 assert.equal(result.available,false)
 assert.equal(loadCoachFinding(result,'activity',null,'2026-11-14'),null)
 assert.equal(activityLoadComparison([],null,'2026-11-14'),null)
})
test('duplicate provider imports do not inflate either week or personal baseline',()=>{
 const a=mk('2026-11-10',90,'a','Run','09:00:00',10000)
 const b=mk('2026-11-10',90,'other','Run','09:01:00',10020)
 const c=mk('2026-11-11',20,'ride','Ride','17:00:00',30000)
 assert.equal(completedLoadActivities([a,b,c]).length,2)
 assert.equal(completedLoadActivities([a,a,c]).length,2)
 assert.equal(completedLoadActivities([mk('2026-11-11',null,'a')]).length,0)
})
test('weekly load compares last COMPLETE week, not Monday vs seven days',()=>{
 const monday='2026-11-16'
 const weekStarts=['2026-11-09','2026-11-02','2026-10-26','2026-10-19','2026-10-12']
 const loads=[220,140,140,150,170]
 const history=weekStarts.map((d,i)=>mk(shiftDay(d,2),loads[i],'w'+i))
 const result=weekLoadComparison(history,monday,'2026-11-16')
 assert.equal(result.available,true)
 assert.equal(result.weekStart,'2026-11-09')
 assert.equal(result.isPreviousWeek,true)
 assert.equal(result.load,220)
 assert.equal(result.baseline,145)
 assert.equal(result.category,'higher')
 const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21'}
 const finding=loadCoachFinding(result,'week',goal,shiftDay(result.weekStart,6))
 assert.match(finding.text,/Wettkampf in 6 Tagen/)
 assert.match(finding.text,/Frische/)
})
test('completed selected week gets its own historical four-week baseline',()=>{
 const weeks=['2026-11-09','2026-11-02','2026-10-26','2026-10-19','2026-10-12']
 const data=weeks.map((w,i)=>mk(w,[140,180,200,210,220][i],'t'+i))
 const result=weekLoadComparison(data,'2026-11-09','2026-11-16')
 assert.equal(result.available,true)
 assert.equal(result.weekStart,'2026-11-09')
 assert.equal(result.isPreviousWeek,false)
 assert.equal(result.category,'lower')
 assert.equal(result.previousWeeks,4)
})
test('weeks without any imported activity never contribute fabricated zero-load observations',()=>{
 const rows=[mk('2026-11-10',200,'a'),mk('2026-10-26',180,'b')]
 const c=weekLoadComparison(rows,'2026-11-16','2026-11-16')
 assert.equal(c.available,false)
 assert.equal(c.reason,'incomplete-week-history')
 assert.equal(c.previousWeeks,1)
 assert.equal(loadCoachFinding(c,'week',null,'2026-11-15'),null)
})
test('server and UI remain owner-only, GET only, no auto-plan changes',()=>{
 const edge=read('supabase/functions/garmin-intervals-insights/index.ts')
 const visual=read('src/components/SessionVisualInsights.tsx')
 const weekly=read('src/components/IntervalsCoachContext.tsx')
 const visualCSS=read('src/styles/session-visual-insights.css')
 const weeklyCSS=read('src/styles/intervals-coach.css')
 assert.match(edge,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(edge,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(edge,/req\.method!=='GET'/)
 assert.match(edge,/garmin_intervals_key_get/)
 assert.match(edge,/activityLoadComparison\(remoteActivities/)
 assert.match(edge,/weekLoadComparison\(remoteActivities/)
 assert.match(edge,/loadCoachFinding/)
 assert.match(edge,/historyWindowDays:56/)
 assert.match(visual,/sv-load-comparison/)
 assert.match(visual,/Persönlicher Vergleich noch nicht zuverlässig möglich/)
 assert.match(visual,/Bereich deiner bisherigen Vergleichswerte|loadLabel/)
 assert.match(weekly,/ic-week-load/)
 assert.match(weekly,/letzten abgeschlossenen/)
 assert.match(visualCSS,/@media\(max-width:600px\)/)
 assert.match(weeklyCSS,/@media\(max-width:600px\)/)
 assert.doesNotMatch(edge,/\bmethod:'POST'|\bmethod:'PUT'/)
})
