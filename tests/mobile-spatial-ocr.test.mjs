import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {interpretSpatialTrainerPhoto,spatialPhotoReviewIssues} from '../src/lib/spatialTrainerPhoto.ts'
import {validateTrainerWorkout} from '../supabase/functions/_shared/workout-archive-schema.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const header=['OERLINGHAUSEN RUNCREW','Schwelle im Wechsel · 3 x (3 x 1000 m)',
 '2 km einlaufen mit Minibändern','Zwischen den 1000 m 200 m Trabpause',
 'Auslaufen und Dehnen'].join('\n')
const rows=[
 {name:'Fuchs',leftText:'FUCHS\n9 x 1000 m\n3 + 3 + 3',
  rightText:'4:00 3:50 4:10 @ 4:00 3:50 4:10 @ 4:00 3:50 4:10\n1:36 1:32 1:40 1:36 1:32 1:40 1:36 1:32 1:40'},
 {name:'Wolf',leftText:'WOLF\n8 x 1000 m\n3 + 3 + 2',
  rightText:'4:20 4:10 4:30 @ 4:20 4:10 4:30 @ 4:20 4:10\n1:44 1:40 1:48 1:44 1:40 1:48 1:44 1:40'},
 {name:'Tiger',leftText:'TIGER\n8 x 1000 m\n3+3+2',
  rightText:'4:40 4:30 4:50 @ 4:40 4:30 4:50 @ 4:40 4:30\n1:52 1:48 1:56 1:52 1:48 1:56 1:52 1:48'},
 {name:'Bären',leftText:'BAREN\n7*x1000 m\n3+3+1',
  rightText:'5:00 4:50 5:10 @ 5:00 4:50 5:10 @ 5:00\n2:00 1:56 2:04 2:00 1:56 2:04 2:00'},
 {name:'Capybara',leftText:'CAPYBARA\n7x 1000 m\n3+3+1',
  rightText:'5:20 5:10 5:30 @ 5:20 5:10 5:30 @ 5:20\n2:08 2:04 2:12 2:08 2:04 2:12 2:08'}
]
test('all five original poster rows are recognized with their own paces',()=>{
 const p=interpretSpatialTrainerPhoto({text:header,rows})
 assert.equal(p.detectedGroups,5)
 assert.deepEqual(p.workout.groups.map(g=>g.name),['Fuchs','Wolf','Tiger','Bären','Capybara'])
 const expected={Fuchs:[240,230,250],Wolf:[260,250,270],
  Tiger:[280,270,290],Bären:[300,290,310],Capybara:[320,310,330]}
 p.workout.groups.forEach(g=>{
  const n=g.name==='Fuchs'?9:['Bären','Capybara'].includes(g.name)?7:8
  assert.equal(g.steps.filter(s=>s.kind==='run').length,n)
  assert.equal(g.steps.filter(s=>s.kind==='recovery').length,n-1)
  assert.deepEqual(g.steps.filter(s=>s.kind==='run').slice(0,3)
   .map(s=>s.paceSecondsPerKm),expected[g.name])
  assert.ok(g.steps.every(s=>s.distanceMeters===1000||s.distanceMeters===200))
 })
 assert.equal(p.workout.warmup.distanceMeters,2000)
 assert.deepEqual(spatialPhotoReviewIssues(p.workout),[])
 assert.ok(validateTrainerWorkout(p.workout))
 assert.match(p.recognizedText,/Zeilenweise Gruppenlesung/)
})
test('400m subline is never used as a Capybara pace',()=>{
 const p=interpretSpatialTrainerPhoto({text:header,rows:[rows[4]]})
 assert.deepEqual(p.workout.groups[0].steps.filter(s=>s.kind==='run')
  .map(s=>s.paceSecondsPerKm),[320,310,330,320,310,330,320])
})
test('different workout 400m and 800m can be read without old template',()=>{
 const p=interpretSpatialTrainerPhoto({text:'Neues Training · 200 m Trabpause',rows:[
  {name:'Wolf',leftText:'WOLF 4 x 800 m\n2+2',
   rightText:'4:25 4:10 4:30 4:15\n1:46 1:40 1:48 1:42'},
  {name:'Tiger',leftText:'TIGER 3 x 400 m\n1+1+1',
   rightText:'5:10 5:20 5:00\n2:04 2:08 2:00'}]})
 assert.deepEqual(p.workout.groups[0].steps.filter(s=>s.kind==='run')
  .map(s=>[s.distanceMeters,s.paceSecondsPerKm]),[[800,265],[800,250],[800,270],[800,255]])
 assert.deepEqual(p.workout.groups[1].steps.filter(s=>s.kind==='run')
  .map(s=>[s.distanceMeters,s.paceSecondsPerKm]),[[400,310],[400,320],[400,300]])
})
test('unrecognized group fields do not become invented valid records',()=>{
 const p=interpretSpatialTrainerPhoto({text:header,rows:[
  rows[1],{name:'Tiger',leftText:'TIGER unreadable',rightText:'4:40 4:30'}]})
 assert.equal(p.detectedGroups,2)
 assert.deepEqual(p.incompleteGroups,['Tiger'])
 assert.ok(p.warnings.some(w=>w.includes('Tiger')))
 assert.equal(validateTrainerWorkout(p.workout),null)
 assert.ok(spatialPhotoReviewIssues(p.workout).some(w=>w.includes('Tiger')))
})
test('incomplete paces remain null and block OCR archive save',()=>{
 const p=interpretSpatialTrainerPhoto({text:header,rows:[
  {name:'Wolf',leftText:'WOLF 8 x 1000 m\n3+3+2',
   rightText:'4:20 4:10 4:30'}]})
 assert.deepEqual(p.workout.groups[0].steps.filter(s=>s.kind==='run')
  .map(s=>s.paceSecondsPerKm),[260,250,270,null,null,null,null,null])
 assert.ok(p.warnings.some(w=>w.includes('3 von 8')))
 assert.ok(spatialPhotoReviewIssues(p.workout).length>0)
})
test('browser OCR isolates group rows locally and retains security boundary',()=>{
 const code=read('src/lib/localTrainerPhotoOcr.ts')
 assert.match(code,/sandbox','allow-scripts'/)
 assert.match(code,/tesseract\.js@7\.0\.0/)
 assert.match(code,/tessedit_pageseg_mode:'11'/)
 assert.match(code,/tessedit_pageseg_mode:'6'/)
 assert.match(code,/blocks:true/)
 assert.match(code,/rows\.push\(\{name:item\.name/)
 assert.match(code,/if\(found\.length<5\)/)
 assert.match(code,/resolve\(\{text:\(data\.text\|\|''\)/)
 assert.doesNotMatch(code,/api\.openai\.com|SUPABASE_SERVICE_ROLE/)
})
test('single popup uses dynamic row OCR before flat fallback, never the old template automatically',()=>{
 const code=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(code,/ocr\.rows\.length>0\?/)
 assert.match(code,/interpretSpatialTrainerPhoto\(ocr\)/)
 assert.match(code,/interpretLocalPhotoText\(ocr\.text\)/)
 assert.doesNotMatch(code,/if\(knownTemplate\)/)
 assert.match(code,/spatialPhotoReviewIssues\(editing\)/)
 assert.match(code,/<WorkoutReviewDialog/)
 assert.match(code,/action:'save',clientRequestId:requestId\.current,reviewed:true/)
})

test('sandbox iframe code is executable JS with functional word-boundary group patterns',()=>{
 const source=read('src/lib/localTrainerPhotoOcr.ts')
 const start=source.indexOf('const LOCAL_OCR_FRAME=')
 const end=source.indexOf(';\n\nfunction readDataUrl(',start)
 assert.ok(start>=0&&end>start)
 const assignment=source.slice(start+'const LOCAL_OCR_FRAME='.length,end)
 const html=vm.runInNewContext(assignment)
 const scriptStart=html.indexOf('<script>\n(function(){')
 assert.ok(scriptStart>0)
 const scriptEnd=html.indexOf('</script>',scriptStart)
 assert.ok(scriptEnd>scriptStart)
 assert.doesNotThrow(()=>new vm.Script(html.slice(scriptStart+8,scriptEnd)))
 assert.ok(html.includes('/\\bFUCHS\\b/i'))
 assert.ok(html.includes('/\\bB[ÄA]REN\\b/i'))
 assert.doesNotMatch(html,/allow-same-origin|api\.openai\.com/)
})
