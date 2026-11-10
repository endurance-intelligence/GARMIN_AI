import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {interpretLocalPhotoText,isKnownOrcOriginal} from '../src/lib/localPhotoWorkout.ts'
import {previousOrcFlyer} from '../src/lib/workoutLibrary.ts'
import {validateTrainerWorkout} from '../supabase/functions/_shared/workout-archive-schema.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

const noisyPoster=String.raw`@MR.MORNINGRUN OERLINGHAUSEN RUNCREW
TRACK TUESDAY - TEMPOGEFUHL
Schwelle im Wechsel.
3 x (3 x 1000 m)
Jeder Satz hat drei Gange: 1. an der Schwelle, 2. 10 s/km schneller, 3. 10 s/km langsamer.
200 m Trabpause.
TEIL 1 - WARM-UP TEIL 3 - COOLDOWN
2km Auslaufen
einlaufen + Ubungen mit den + locker dehnen
Minibandern
Teil 2 - Hauptteil
FUCHS :
4B 9*1000m
3+3+3 4:00 3:50 4:10 @ 4:00 3:50 4:10
WOLF
>. -§ 81000 m
3+3+2
TIGER
& 81000 m
3+3+2
BAREN
S 7*1000m
3+3+1
CAPYBARA
> 7*1000 m
3+3+1
`

test('real noisy poster OCR no longer opens an empty fake workout',()=>{
 const parsed=interpretLocalPhotoText(noisyPoster)
 assert.ok(parsed.workout)
 assert.equal(parsed.detectedGroups,5)
 assert.deepEqual(parsed.workout.groups.map(g=>g.name),
  ['Fuchs','Wolf','Tiger','Bären','Capybara'])
 assert.equal(parsed.workout.groups[1].steps.filter(s=>s.kind==='run').length,8)
 assert.equal(parsed.workout.groups[1].steps[0].paceSecondsPerKm,null)
 assert.ok(parsed.warnings.some(w=>w.includes('Multiplikationszeichen')))
})
test('known original is recognized only with independent poster evidence',()=>{
 assert.equal(isKnownOrcOriginal(noisyPoster),true)
 assert.equal(isKnownOrcOriginal('Schwelle im Wechsel 8 x 1000 m WOLF'),false)
 assert.equal(isKnownOrcOriginal('FUCHS WOLF TIGER BÄREN CAPYBARA 3 x (3 x 1000 m)'),false)
 const reference=previousOrcFlyer()
 assert.ok(validateTrainerWorkout(reference))
 assert.equal(reference.groups.length,5)
 assert.deepEqual(reference.groups.find(g=>g.name==='Wolf').steps
  .filter(s=>s.kind==='run').map(s=>s.paceSecondsPerKm),
  [260,250,270,260,250,270,260,250])
})
test('OCR handles 8 × 1000m, 8x1000m, 8 1000m and fused 81000m',()=>{
 for(const spelling of ['8 × 1000 m','8x1000m','8*1000m','8 1000 m','81000 m']){
  const text='ORC\nWOLF\n'+spelling+'\n3+3+2\n4:20 4:10 4:30\n200 m Trabpause'
  const parsed=interpretLocalPhotoText(text)
  assert.ok(parsed.workout,spelling)
  assert.equal(parsed.workout.groups[0].steps.filter(s=>s.kind==='run').length,8)
  assert.equal(parsed.workout.groups[0].steps[0].paceSecondsPerKm,260)
 }
})
test('warmup distance can precede or follow the word einlaufen',()=>{
 for(const wording of [
  '2 km\n einlaufen + Minibänder','Einlaufen 2 km + Minibänder'
 ]){
  const parsed=interpretLocalPhotoText(
   'Track Training\n'+wording+'\nWolf\n8 × 1000 m\n4:20 4:10 4:30\n3+3+2')
  assert.equal(parsed.workout?.warmup.distanceMeters,2000)
 }
})
test('OCR fallback reports original text and never silently claims successful extraction',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/if\(knownTemplate\)/)
 assert.match(ui,/begin\(previousOrcFlyer\(\),'trainer_photo',hash\)/)
 assert.match(ui,/Paces stammen aus unserer zuvor geprüften Trainer-Grafik/)
 assert.match(ui,/else if\(interpreted.workout\)/)
 assert.match(ui,/setEditing\(null\)/)
 assert.match(ui,/keine vollständige Intervallstruktur/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/className="wr-ocr-text"/)
 assert.match(ui,/completeOcrManually/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/Geprüfte Vorlage archivieren/)
})
test('no new Garmin writes or unreviewed archive records',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/action:'save',clientRequestId:requestId.current,reviewed:true/)
 assert.match(ui,/crypto.subtle.digest\('SHA-256',await file.arrayBuffer\(\)\)/)
 assert.doesNotMatch(ui,/scheduleWorkout\(|uploadWorkout\(|addWeighIn\(/)
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
})
