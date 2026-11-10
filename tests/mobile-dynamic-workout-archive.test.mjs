import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateTrainerWorkout,describeWorkoutGroup}
 from '../supabase/functions/_shared/workout-archive-schema.mjs'
import {previousOrcFlyer,blankTrainerWorkout,workoutSummary,parsePace,formatPace}
 from '../src/lib/workoutLibrary.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('prior ORC poster is a one-time archive candidate with all five original groups',()=>{
 const flyer=previousOrcFlyer()
 assert.ok(validateTrainerWorkout(flyer))
 assert.equal(flyer.groups.length,5)
 const wolf=flyer.groups.find(g=>g.name==='Wolf')
 assert.ok(wolf)
 assert.equal(wolf.steps.filter(s=>s.kind==='run').length,8)
 assert.equal(wolf.steps.filter(s=>s.kind==='recovery').length,7)
 assert.deepEqual(wolf.steps.filter(s=>s.kind==='run').map(s=>s.paceSecondsPerKm),
  [260,250,270,260,250,270,260,250])
 assert.equal(workoutSummary(wolf).distanceMeters,8000)
 assert.equal(describeWorkoutGroup(flyer,'Wolf').recoveryCount,7)
 assert.match(flyer.warmup.notes,/Minibändern/)
})

test('arbitrary new track sessions are validated independently of original picture',()=>{
 const newSession={
  version:1,title:'Neue Intervalle 12×400 m',trainer:'ORC Lauftrainer',
  sourceLabel:'Samstag Bahn',
  warmup:{distanceMeters:1500,durationSeconds:null,notes:'Einlaufen'},
  cooldown:{distanceMeters:null,durationSeconds:900,notes:'Locker'},
  groups:[{name:'Wolf',notes:'400m-Temposteigerung',steps:Array.from({length:12},(_,i)=>({
   kind:'run',distanceMeters:400,durationSeconds:null,
   paceSecondsPerKm:260-(i%3)*5,notes:''
  })).flatMap((step,i)=>i===11?[step]:[step,{
   kind:'recovery',distanceMeters:200,durationSeconds:null,
   paceSecondsPerKm:null,notes:'Trab'
  }])}]
 }
 const checked=validateTrainerWorkout(newSession)
 assert.ok(checked)
 assert.equal(checked.groups[0].steps.length,23)
 assert.equal(checked.groups[0].steps.filter(s=>s.kind==='run').length,12)
 assert.equal(checked.cooldown.durationSeconds,900)
})

test('supports time-based efforts and explicitly unknown pace or cooldown',()=>{
 const w=blankTrainerWorkout()
 w.title='5 × 3 Minuten Fahrtspiel'
 w.groups[0].steps=[{kind:'run',distanceMeters:null,durationSeconds:180,paceSecondsPerKm:null,notes:'zügig'}]
 assert.ok(validateTrainerWorkout(w))
 const invalid=structuredClone(w)
 invalid.groups[0].steps[0].durationSeconds=null
 assert.equal(validateTrainerWorkout(invalid),null)
 const duplicate=structuredClone(w)
 duplicate.groups.push(structuredClone(duplicate.groups[0]))
 assert.equal(validateTrainerWorkout(duplicate),null)
})

test('photo transcription cannot save an incomplete or fabricated workout',()=>{
 const w=previousOrcFlyer()
 w.groups[0].steps[0].paceSecondsPerKm=1
 assert.equal(validateTrainerWorkout(w),null)
 const other=previousOrcFlyer()
 other.groups[0].steps[0].distanceMeters=2
 assert.equal(validateTrainerWorkout(other),null)
})

test('pace entry supports exact min/km seconds and invalid values fail closed',()=>{
 assert.equal(parsePace('4:20'),260)
 assert.equal(formatPace(270),'4:30')
 assert.equal(parsePace('x:xx'),null)
 assert.equal(parsePace('4:60'),null)
})

test('archive SQL uses strict service-only RLS and immutable calendar snapshots',()=>{
 const sql=read('supabase/migrations/20261110084000_dynamic_workout_archive_v0913.sql')
 assert.match(sql,/garmin_workout_archive ENABLE ROW LEVEL SECURITY/)
 assert.match(sql,/REVOKE ALL ON TABLE public.garmin_workout_archive FROM public,anon,authenticated/)
 assert.match(sql,/GRANT SELECT,INSERT ON TABLE public.garmin_workout_archive TO service_role/)
 assert.match(sql,/archive_snapshot jsonb/)
 assert.match(sql,/archive_workout_id uuid REFERENCES/)
 assert.match(sql,/garmin_workout_archive_plan\(/)
 assert.match(sql,/p_group/)
 assert.match(sql,/pg_catalog\.jsonb_build_object\(/)
 assert.match(sql,/session_type,sport/)
 assert.match(sql,/'event','running'/)
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.garmin_workout_archive_plan/)
})

test('photo image analysis requires private secret and explicit owner authentication',()=>{
 const edge=read('supabase/functions/garmin-workout-archive/index.ts')
 assert.match(edge,/auth.auth.getUser\(bearer\[1\]\)/)
 assert.match(edge,/user.email_confirmed_at/)
 assert.match(edge,/user.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(edge,/Deno.env.get\('OPENAI_API_KEY'\)/)
 assert.match(edge,/store:false/)
 assert.match(edge,/input_image/)
 assert.match(edge,/vision_not_configured/)
 assert.match(edge,/validateTrainerWorkout\(json\)/)
 assert.match(edge,/body.reviewed!==true/)
 assert.match(edge,/client_request_id:body.clientRequestId/)
 assert.doesNotMatch(edge,/scheduleWorkout\(|addWeighIn\(|GARMIN_OAUTH|garmin_connect_session_get/)
})

test('mobile calendar no longer binds ORC to two fixed weekdays',()=>{
 const calendar=read('src/pages/CalendarPage.tsx')
 const panel=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(calendar,/<WorkoutArchivePanel active=\{active\} date=\{selected\}/)
 assert.doesNotMatch(calendar,/orcDay|<OrcTrackBuilder/)
 assert.match(panel,/Trainerbild importieren/)
 assert.match(panel,/Manuell erfassen/)
 assert.match(panel,/Letzte ORC-Grafik übernehmen/)
 assert.match(panel,/Geprüfte Vorlage archivieren/)
 assert.match(panel,/action:'plan'/)
 assert.match(panel,/action:'parse_photo'/)
 assert.match(panel,/p\.notes|record\.workout\.groups/)
 assert.doesNotMatch(panel,/scheduleWorkout\(|uploadWorkout\(|GARMIN_API_KEY|service_role/)
})

test('coach may later query archives without silently changing original workouts',()=>{
 const api=read('supabase/functions/garmin-workout-archive/index.ts')
 const sql=read('supabase/migrations/20261110084000_dynamic_workout_archive_v0913.sql')
 assert.match(api,/garmin_workout_archive/)
 assert.match(api,/action==='plan'/)
 assert.match(sql,/schema_version integer NOT NULL DEFAULT 1/)
 assert.match(sql,/reviewed_at timestamptz/)
 assert.match(sql,/archive_snapshot/)
 assert.doesNotMatch(api,/\.update\(.*workout/)
})
