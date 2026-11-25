import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {quickCoachAction} from '../src/lib/calendarQuickAccept.mjs'
const today='2026-11-25',day={date:today,kind:'easy',approvable:true}
test('quick accept is only available for real open decisions; alternatives are reviewed',()=>{
 const get=(d,alternatives=[])=>quickCoachAction({days:[d],alternatives},d.date,today)
 assert.equal(get(day),'draft')
 assert.equal(get({...day,kind:'recovery',approvable:false}),'rest')
 assert.equal(get(day,[{date:today,mode:'alternative'}]),'choose')
 for(const patch of [{decision:'accepted'},{decision:'declined'},{selectedGroup:{code:'orc'}},{kind:'illness'},{kind:'blocked'},{kind:'race'},{kind:'completed'},{kind:'existing'},{approvable:false},{date:'2026-11-24'},{date:'2026-12-09'}])assert.equal(get({...day,...patch}),null)
})
test('quick actions are real owner-confirmed writes; rest does not create a workout',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const p=read('src/pages/CalendarPage.tsx'),b=read('src/components/CalendarWeekBoard.tsx')
 assert.match(b,/className="hwb-quick-accept"/)
 assert.match(b,/onQuickAccept\(coach\)/)
 assert.match(b,/Entwurf · 18:00/)
 assert.match(p,/action==='choose'\)\{onOpenCoach\(day.date\)/)
 assert.match(p,/await acceptCoach\(day,true\)/)
 assert.match(p,/const chosenTime=quick\?'18:00':coachStartTime/)
 const rest=p.slice(p.indexOf('async function quickAccept'),p.indexOf('async function approvePlan'))
 assert.match(rest,/loadCoachSnapshot/)
 assert.match(rest,/action:'set_day_decision',date:day.date,choice:'accepted'/)
 assert.doesNotMatch(rest,/action:'create'|action:'publish'/)
 assert.match(p,/plan&&plan.state==='draft'/)
 assert.match(p,/An Intervals.icu senden/)
 assert.doesNotMatch(p,/hc-week-planner|hc-source-details/)
 assert.match(p,/Analyse des ausgewählten Tages/)
 assert.match(p,/Workout-Bibliothek &amp; ORC-Import/)
})
