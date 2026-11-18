import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {interpretLocalPhotoText} from '../src/lib/localPhotoWorkout.ts'
import {validateTrainerWorkout} from '../supabase/functions/_shared/workout-archive-schema.mjs'
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8')

const photoText=`ORC TRACK TUESDAY
SCHWELLE IM WECHSEL
TEIL 1 WARM UP
2 km einlaufen
200 m Trabpause
WOLF
8 x 1000 m
3+3+2
4:20 4:10 4:30
1:44 1:40 1:48
TIGER
8 x 1000 m
3+3+2
4:40 4:30 4:50
1:52 1:48 1:56
`
test('local OCR interpretation extracts genuinely observed Wolf and Tiger steps',()=>{
 const result=interpretLocalPhotoText(photoText)
 assert.equal(result.detectedGroups,2)
 assert.ok(result.workout)
 assert.equal(result.workout.title,'SCHWELLE IM WECHSEL')
 assert.equal(result.workout.warmup.distanceMeters,2000)
 assert.deepEqual(result.workout.groups.map(g=>g.name),['Wolf','Tiger'])
 const wolf=result.workout.groups[0]
 assert.equal(wolf.steps.filter(s=>s.kind==='run').length,8)
 assert.equal(wolf.steps.filter(s=>s.kind==='recovery').length,7)
 assert.deepEqual(wolf.steps.filter(s=>s.kind==='run').map(s=>s.paceSecondsPerKm),
 [260,250,270,260,250,270,260,250])
 assert.equal(wolf.steps.filter(s=>s.kind==='recovery')[0].distanceMeters,200)
 assert.deepEqual(result.workout.groups[1].steps.filter(s=>s.kind==='run')
   .map(s=>s.paceSecondsPerKm).slice(0,3),[280,270,290])
 assert.ok(validateTrainerWorkout(result.workout))
 assert.ok(result.warnings.some(x=>/Wiederholung/.test(x)))
})
test('unknown values remain null and trigger clear review rather than a fabricated pace',()=>{
 const r=interpretLocalPhotoText('ORC\nWOLF\n8 x 1000 m\n3 + 3 + 2\n4:20')
 assert.ok(r.workout)
 const paces=r.workout.groups[0].steps.filter(s=>s.kind==='run').map(s=>s.paceSecondsPerKm)
 assert.equal(paces[0],260)
 assert.deepEqual(paces.slice(1),[null,null,null,null,null,null,null])
 assert.ok(r.warnings.some(x=>/Nicht alle Tempi lesbar/.test(x)))
})
test('different new workout without known group is recognized as uncertain generic group',()=>{
 const r=interpretLocalPhotoText('SAMSTAG TEMPO\n12 x 400 m\n1:24 1:22 1:20')
 assert.ok(r.workout)
 assert.equal(r.workout.groups[0].name,'Gruppe prüfen')
 assert.equal(r.workout.groups[0].steps.filter(s=>s.kind==='run').length,12)
 assert.equal(r.workout.groups[0].steps[0].paceSecondsPerKm,null)
 assert.ok(r.warnings.some(x=>/Nicht alle Tempi lesbar/.test(x)))
})
test('unknown photo contents never result in a fake verified workout',()=>{
 const blank=interpretLocalPhotoText('MORGEN IST LOCKERER LAUF GEPLANT')
 assert.equal(blank.workout,null)
 assert.equal(blank.detectedGroups,0)
 const empty=interpretLocalPhotoText('')
 assert.equal(empty.workout,null)
})
test('free local OCR runs in sandbox with no Supabase session or OpenAI HTTP requests',()=>{
 const script=read('src/lib/localTrainerPhotoOcr.ts')
 assert.match(script,/sandbox','allow-scripts'/)
 assert.doesNotMatch(script,/allow-same-origin/)
 assert.match(script,/referrerpolicy','no-referrer'/)
 assert.match(script,/tesseract\.js@7\.0\.0/)
 assert.match(script,/worker\.recognize\(msg\.image\)/)
 assert.match(script,/readAsDataURL\(file\)/)
 assert.match(script,/event\.source!==frame\.contentWindow/)
 assert.doesNotMatch(script,/api\.openai\.com|supabase\.co\/functions|service_role|OPENAI_API_KEY/)
})
test('free import is default, paid external vision must be expanded deliberately',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/Foto kostenlos lokal lesen/)
 assert.match(ui,/readTrainerPhotoLocally\(file/)
 assert.match(ui,/interpretLocalPhotoText\(ocr\.text\)/)
 assert.match(ui,/crypto\.subtle\.digest\('SHA-256',await file\.arrayBuffer\(\)\)/)
 assert.match(ui,/<details className="wa-paid-alternative">/)
 assert.match(ui,/kostenpflichtige API/)
 assert.match(ui,/begin\(interpreted.workout,'trainer_photo',hash\)/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/Originalfoto zum Vergleichen/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/Geprüfte Vorlage archivieren/)
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
})
test('save stays owner-approved and photo-hashed without changing protected Garmin writes',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 const server=read('supabase/functions/garmin-workout-archive/index.ts')
 assert.match(ui,/action:'save',clientRequestId:requestId\.current,reviewed:true/)
 assert.match(ui,/workout:editing,sourceKind,sourceImageSha256:imageHash/)
 assert.match(server,/body\.sourceKind==='trainer_photo'/)
 assert.match(server,/body\.reviewed!==true/)
 assert.doesNotMatch(ui,/scheduleWorkout\(|uploadWorkout\(|addWeighIn\(/)
})
