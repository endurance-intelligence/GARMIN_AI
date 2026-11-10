import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 ORC_GROUPS,buildOrcWorkout,toGarminRunningSpec,orcDraftNotes,paceLabel
} from '../src/lib/orcTrackWorkout.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('source photo has exactly five groups and 3+3+2 Wolf structure',()=>{
 assert.deepEqual(ORC_GROUPS,['Fuchs','Wolf','Tiger','Bären','Capybara'])
 const workout=buildOrcWorkout('Wolf')
 assert.deepEqual(workout.blocks,[3,3,2])
 assert.equal(workout.intervalCount,8)
 assert.equal(workout.effortMeters,8000)
 assert.equal(workout.recoveryMeters,1400)
 assert.equal(workout.minimumMeters,11400)
 assert.equal(workout.steps[0].distanceMeters,2000)
 assert.equal(workout.steps[1].kind,'drill')
 assert.equal(workout.steps.at(-1).kind,'cooldown')
})

test('photo Wolf paces repeat 4:20 / 4:10 / 4:30 with final two intervals',()=>{
 const w=buildOrcWorkout('Wolf')
 assert.deepEqual(w.steps.filter(x=>x.kind==='interval').map(x=>x.pace?.label),
  ['4:20','4:10','4:30','4:20','4:10','4:30','4:20','4:10'])
 assert.equal(w.steps.filter(x=>x.kind==='recovery').length,7)
 assert.deepEqual(w.steps.filter(x=>x.kind==='recovery'&&x.pauseAfterBlock)
  .map(x=>x.notes),[
    'Serienpause: 200 m locker traben und trinken',
    'Serienpause: 200 m locker traben und trinken'
  ])
})

test('other photo groups produce accurate pace targets and number of kilometres',()=>{
 const paceSets={
  Fuchs:{n:9,pattern:['4:00','3:50','4:10']},
  Tiger:{n:8,pattern:['4:40','4:30','4:50']},
  Bären:{n:7,pattern:['5:00','4:50','5:10']},
  Capybara:{n:7,pattern:['5:20','5:10','5:30']}
 }
 for(const [name,details] of Object.entries(paceSets)){
  const w=buildOrcWorkout(name)
  assert.equal(w.intervalCount,details.n)
  assert.deepEqual(w.steps.filter(x=>x.kind==='interval')
   .slice(0,3).map(x=>x.pace.label),details.pattern)
  assert.equal(w.minimumMeters,2000+details.n*1000+(details.n-1)*200)
 }
 assert.equal(paceLabel(250),'4:10')
 assert.throws(()=>buildOrcWorkout('Unbekannt'))
})

test('Garmin-running workout schema retains warmup, untimed drills and open cooldown',()=>{
 const w=buildOrcWorkout('Wolf')
 const spec=toGarminRunningSpec(w)
 assert.equal(spec.sport,'running')
 assert.equal(spec.name,w.name)
 assert.equal(spec.steps.length,18)
 assert.deepEqual(spec.steps.slice(0,2),[
  {type:'warmup',distance:2000},
  {type:'other',lapButton:true,notes:'Miniband-Übungen; LAP drücken, wenn bereit'}
 ])
 const efforts=spec.steps.filter(s=>s.type==='interval')
 assert.equal(efforts.length,8)
 assert.equal(efforts[0].distance,1000)
 assert.deepEqual(efforts[0].target.pace.minPerKm,[255/60,265/60])
 assert.equal(spec.steps.at(-1).lapButton,true)
 assert.equal(spec.steps.at(-1).type,'cooldown')
})

test('private draft summary is short enough for edge validation',()=>{
 const notes=orcDraftNotes(buildOrcWorkout('Wolf'))
 assert.ok(notes.length<500)
 assert.match(notes,/2 km Einlaufen/)
 assert.match(notes,/4:20\/4:10\/4:30/)
 assert.match(notes,/KEIN Garmin-Workout/)
})

test('calendar exposes workout builder only for existing Tuesday / Saturday choices',()=>{
 const cal=read('src/pages/CalendarPage.tsx')
 assert.match(cal,/\[2,6\]\.includes\(new Date\(selected\+'T12:00:00Z'\)\.getUTCDay\(\)\)/)
 assert.match(cal,/\{orcDay&&<OrcTrackBuilder date=\{selected\}/)
 assert.match(cal,/hasGarminWorkout=\{matching.some\(e=>e.source==='garmin'\)\}/)
 assert.match(cal,/<details className="hc-plan-notes">/)
})

test('only an explicit authenticated user click may create a draft',()=>{
 const component=read('src/components/OrcTrackBuilder.tsx')
 assert.match(component,/onClick=\{\(\)=>void save\(\)\}/)
 assert.match(component,/garminSupabase.auth.getSession\(\)/)
 assert.match(component,/action:'create',clientRequestId:requestId,date/)
 assert.match(component,/sessionType:'event',sport:'running'/)
 assert.match(component,/orcDraftNotes\(workout\)/)
 assert.match(component,/p.title===workout.name&&p.state!=='cancelled'/)
 assert.match(component,/Garmin-Workout-Erstellung noch nicht freigeschaltet/)
 assert.doesNotMatch(component,/scheduleWorkout\(|uploadWorkout\(|service_role|SUPABASE_SECRET/)
})

test('iPhone presentation stays a collapsed session preview without large dashboards',()=>{
 const css=read('src/styles/orc-track.css')
 assert.match(css,/\.orc-builder>summary\{/)
 assert.match(css,/@media\(max-width:760px\)/)
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/)
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
})
