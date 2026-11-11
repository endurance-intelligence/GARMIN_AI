import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {completedWeeklyOption} from '../src/lib/weeklyOptionCompletion.ts'
import {buildMovementPlan,MOVEMENT_PATTERNS} from '../src/lib/movementSession.ts'
import {EI_EXERCISES} from '../src/lib/eiExercises.ts'
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const monday={code:'football-mon',weekday:1,start_time:'19:00'}
const tuesday={code:'orc-track-tue',weekday:2,start_time:'19:00'}
const saturday={code:'orc-track-sat',weekday:6,start_time:'09:00'}
const football={sport_type:'soccer',activity_name:'Gütersloh Fußball',
 start_time_local:'2026-11-09 19:14:41',duration_s:85*60}
const run={sport_type:'running',start_time_local:'2026-11-10 19:12:00',duration_s:52*60}

test('real Monday football (19:14, 85 min) suppresses Monday recurring option',()=>{
 assert.equal(completedWeeklyOption(monday,'2026-11-09',[football]),football)
 assert.equal(completedWeeklyOption(monday,'2026-11-16',[football]),null)
 assert.equal(completedWeeklyOption(tuesday,'2026-11-10',[football]),null)
})
test('training must match sport, day, length and planned start time',()=>{
 assert.equal(completedWeeklyOption(tuesday,'2026-11-10',[run]),run)
 assert.equal(completedWeeklyOption(tuesday,'2026-11-10',[{...run,start_time_local:'2026-11-10 08:00:00'}]),null)
 assert.equal(completedWeeklyOption(tuesday,'2026-11-10',[{...run,duration_s:300}]),null)
 assert.equal(completedWeeklyOption(tuesday,'2026-11-10',[{...run,sport_type:'cycling'}]),null)
 assert.equal(completedWeeklyOption(saturday,'2026-11-14',[{...run,start_time_local:'2026-11-14 09:10:00'}])?.duration_s,52*60)
 assert.equal(completedWeeklyOption(monday,'2026-11-09',[{...football,start_time_local:'2026-11-09 10:00:00'}]),null)
})
test('weekly calendar hides only the matched recurring option, not actual Garmin activity',()=>{
 const board=read('src/components/CalendarWeekBoard.tsx')
 const options=read('src/components/WeeklyTrainingOptions.tsx')
 assert.match(board,/!completedWeeklyOption\(x,day,acts\)/)
 assert.match(board,/\{acts\.map\(activity=>/)
 assert.match(board,/const slot=options\.filter/)
 assert.match(options,/completedWeeklyOption\(option,date,actual\)/)
 assert.match(options,/✓ Absolviert \(Garmin\)/)
 assert.doesNotMatch(board,/GARMIN-KALENDER/)
 assert.doesNotMatch(read('src/pages/CalendarPage.tsx'),/garmin-connect-snapshot/)
})
test('every generated workout movement requires bodyweight only',()=>{
 const index=new Map(EI_EXERCISES.map(x=>[x.id,x]))
 const forbidden=/band|dumbbell|kettlebell|barbell|step|weight|hantel/i
 for(let i=0;i<12;i++){
  const plan=buildMovementPlan('2026-11-11',i)
  assert.equal(plan.minutes,30)
  assert.equal(plan.steps.reduce((sum,x)=>sum+x.workSeconds+x.restSeconds,0),1800)
  assert.equal(plan.strengthIds.length,MOVEMENT_PATTERNS.length)
  for(const id of plan.exerciseIds){
   const exercise=index.get(id)
   assert.ok(exercise,'missing exercise: '+id)
   const equipment=[...(exercise.equipment||[]),...(exercise.equipmentAny||[])]
   assert.ok(equipment.every(item=>!forbidden.test(item)),'equipment '+id+': '+equipment)
  }
 }
 const studio=read('src/pages/StrengthPage.tsx')
 assert.match(studio,/BODYWEIGHT_EXERCISES/)
 assert.match(studio,/Keine Hanteln|ohne Hanteln|ohne Geräte/)
 assert.match(studio,/!x\.equipment\?\.some/)
 assert.match(studio,/!\(x\.equipmentAny\?\.length\)/)
})
test('deletion requires owner identity and explicit confirmation, never deletes an activity',()=>{
 const calendar=read('src/pages/CalendarPage.tsx')
 const intervals=read('supabase/functions/garmin-intervals/index.ts')
 const plan=read('supabase/functions/garmin-training-plan/index.ts')
 assert.match(calendar,/deleteArmed===plan\.id/)
 assert.match(calendar,/action:'delete_published'/)
 assert.match(calendar,/action:'cancel'/)
 assert.match(intervals,/input\.acknowledge!==true/)
 assert.match(intervals,/existing\.external_id!==externalId/)
 assert.match(intervals,/\'garmin-ai:\'\+plan\.id/)
 assert.match(intervals,/intervals\('DELETE','\/athlete\/0\/events\/'/)
 assert.match(intervals,/user\.email_confirmed_at/)
 assert.match(plan,/\.is\('intervals_event_id',null\)/)
 assert.doesNotMatch(intervals,/\.from\('garmin_activities'\)\.delete\(/)
})
