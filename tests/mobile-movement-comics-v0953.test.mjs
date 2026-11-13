import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {buildMovementPlan} from '../src/lib/movementSession.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const mapping=JSON.parse(read('src/lib/exerciseComicAssets.json'))
const library=read('src/lib/eiExercises.ts')
const studio=read('src/pages/StrengthPage.tsx')
const component=read('src/components/ExerciseComic.tsx')
const style=read('src/styles/exercise-comics.css')
const allIds=Object.keys(mapping)
test('24 distinct original local exercise comics: all 24 premium raster cards',()=>{
 assert.equal(allIds.length,24)
 assert.equal(new Set(allIds).size,24)
 const excerpts=[...library.matchAll(/\bexercise\(\{([\s\S]*?)(?=\n  \}\),|\n\}\);)/g)]
 const items=excerpts.map(match=>{
  const block=match[1],id=block.match(/\bid:\s*"([^"]+)"/)?.[1]
  const gear=block.match(/\bequipment:\s*\[([^\]]*)\]/)?.[1]||''
  const any=block.match(/\bequipmentAny:\s*\[([^\]]*)\]/)?.[1]||''
  return {id,gear,any}
 }).filter(({id,gear,any})=>id&&!any&&
  (gear.trim()===''||gear.replace(/[\s"']/g,'')==='mat'))
 assert.deepEqual(allIds.slice().sort(),items.map(x=>x.id).sort())
 const hashes=[]
 for(const id of allIds){
  const path=mapping[id]
  assert.ok(path==='/exercise-comics/'+id+'.svg'||
   path==='/exercise-comics/'+id+'.webp',id)
  const bytes=readFileSync(new URL('../public'+path,import.meta.url))
  if(path.endsWith('.webp')){
   assert.equal(bytes.toString('ascii',0,4),'RIFF')
   assert.equal(bytes.toString('ascii',8,12),'WEBP')
   assert.ok(bytes.length>25000&&bytes.length<150000)
  }else{
   const xml=bytes.toString('utf8')
   assert.match(xml,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
   assert.match(xml,/01\s+START/)
   assert.match(xml,/02\s+BEWEGUNG/)
   assert.match(xml,/GARMIN_AI/)
   assert.match(xml,/<circle/)
   assert.match(xml,/<path/)
   assert.doesNotMatch(xml,/<image\s|https?:\/\/[^"\s]*\.(?:png|jpg|webp)|copyright|youtube/i)
  }
  hashes.push(createHash('sha256').update(bytes).digest('hex'))
 }
 assert.equal(new Set(hashes).size,24)
})
test('exercise IDs are explicit and not the legacy wrong visual alias',()=>{
 assert.ok(mapping['bodyweight-squat'])
 assert.ok(mapping['reverse-lunge'])
 // The premium images are binary WebP; the original diagrams still
 // identify the correct move and remain our offline image fallback.
 assert.match(read('public/exercise-comics/bodyweight-squat.svg'),/Kniebeuge/)
 assert.doesNotMatch(read('public/exercise-comics/bodyweight-squat.svg'),/Goblet/)
 assert.match(read('public/exercise-comics/reverse-lunge.svg'),/Ausfallschritt/)
 assert.equal(mapping['bodyweight-squat'],'/exercise-comics/bodyweight-squat.webp')
 assert.equal(mapping['reverse-lunge'],'/exercise-comics/reverse-lunge.webp')
})
test('each 30-minute session step has an available comic across 30 steps and remix rotations',()=>{
 for(const d of ['2026-11-13','2026-11-14','2026-11-15','2026-11-16']){
  for(const rot of [0,1,2,3,7,20]){
   const p=buildMovementPlan(d,rot)
   assert.equal(p.steps.length,30)
   assert.equal(p.steps.reduce((sum,x)=>sum+x.workSeconds+x.restSeconds,0),1800)
   for(const step of p.steps)assert.ok(mapping[step.exerciseId],step.exerciseId)
  }
 }
})
test('all thumbnails, detailed instruction and active/rest session use the right exercise ID',()=>{
 assert.match(studio,/ExerciseComic id=\{exercise\.id\}/)
 assert.match(studio,/ExerciseComic id=\{detail\.id\}/)
 assert.match(studio,/ExerciseComic id=\{shownExercise\.id\}/)
 assert.match(studio,/const upcoming=player\?\.rest\?plan\.steps\[player\.index\+1\]/)
 assert.match(studio,/Als Nächstes:/)
 assert.match(studio,/shownExercise\.quickStart\|\|shownExercise\.instruction/)
 assert.match(studio,/shownExercise\.cues/)
 assert.doesNotMatch(studio,/youtube\.com\/results/)
 assert.match(studio,/onClick=\{\(\)=>setPlayer\(p=>p\?advance\(p,plan\):p\)\}/)
})
test('static local SVG and WebP URLs respect Pages base path and accessibility',()=>{
 assert.match(component,/import\.meta\.env\.BASE_URL/)
 assert.match(component,/IMAGE_BY_ID\[id\]/)
 assert.match(component,/loading=\{priority\?'eager':'lazy'\}/)
 assert.match(component,/alt=\{'Original-Übungscomic/)
 assert.match(style,/@media\(max-width:500px\)/)
 assert.match(style,/\.ss-player-art/)
 assert.match(style,/\.ss-detail-illustration/)
 assert.match(style,/\.ss-exercise-art/)
})

test('all 24 approved premium comics are mapped explicitly and have local SVG fallbacks',()=>{
 const ids=['forearm-plank','side-plank','dead-bug','bird-dog',
  'glute-bridge','single-leg-balance','bodyweight-squat','reverse-lunge',
  'cat-cow','adductor-rockback','push-up','clamshell','calf-raise',
  'single-leg-calf-raise','knee-to-wall','tibialis-raise','short-foot',
  'hip-flexor-stretch','thoracic-rotation','child-pose-breathing',
  'reverse-snow-angel','prone-ytw','pike-push-up','single-leg-glute-bridge']
 assert.equal(new Set(ids).size,24)
 for(const id of ids){
  assert.equal(mapping[id],'/exercise-comics/'+id+'.webp')
  assert.ok(read('public/exercise-comics/'+id+'.svg').includes('<svg'),id+' fallback')
 }
 assert.equal(Object.values(mapping).filter(x=>x.endsWith('.webp')).length,24)
 assert.equal(Object.values(mapping).filter(x=>x.endsWith('.svg')).length,0)
 assert.match(component,/endsWith\('\.webp'\)/)
 assert.match(component,/onError=\{e=>/)
 assert.match(component,/e\.currentTarget\.src=base/)
 assert.match(style,/\.ec-figure\.is-premium img/)
 assert.match(style,/42dvh/)
 assert.match(style,/object-fit:contain/)
})
