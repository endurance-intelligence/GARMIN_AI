import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DEFAULT_RHYTHM,normalizeRhythm,applyTrainingRhythm} from '../src/lib/trainingRhythm.mjs'
import {quickCoachAction} from '../src/lib/calendarQuickAccept.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const today='2026-11-26'
const free=date=>({date,kind:'recovery',title:'Erholung / freier Tag',sport:'running',approvable:false,minutes:null,reason:'Rest'})
const easy={...free(today),kind:'easy',minutes:40,approvable:true,intensityIntent:'low'}
const ctx={today,equipment:{available:['rowing','bodyweight']}}
test('editable rhythm defaults and validation',()=>{
 assert.deepEqual(normalizeRhythm(DEFAULT_RHYTHM),DEFAULT_RHYTHM)
 assert.equal(normalizeRhythm({...DEFAULT_RHYTHM,rowing:{days:[4,4],minutes:30}}),null)
 assert.deepEqual(normalizeRhythm({...DEFAULT_RHYTHM,rowing:{days:[],minutes:45}}).rowing.days,[])
})
test('normal rhythm replaces one open easy or rest slot, no second workout',()=>{
 const days=applyTrainingRhythm([easy,free('2026-11-27')],DEFAULT_RHYTHM,ctx)
 assert.equal(days[0].kind,'rowing');assert.equal(days[0].sport,'other')
 assert.equal(days[1].kind,'mobility');assert.equal(days[1].sport,'strength')
 assert.equal(days[0].minutes,30)
 assert.equal(quickCoachAction({days},today,today),'draft')
 const both={rowing:{days:[4],minutes:30},strength:{days:[4],minutes:30}}
 const same=applyTrainingRhythm([easy],both,ctx)[0]
 assert.equal(same.rhythm.filter(e=>e.status==='suggested').length,1)
})
test('post-race and protected days preserve original decisions and visible paused preferences',()=>{
 for(const patch of [{kind:'illness'},{kind:'blocked'},{kind:'race'},{kind:'existing'},{kind:'completed'},{kind:'long'},{selectedGroup:{code:'orc'}},{decision:'accepted'},{decision:'declined'}]){
  const d={...easy,...patch}
  const result=applyTrainingRhythm([d],DEFAULT_RHYTHM,ctx)[0]
  assert.equal(result.kind,d.kind);assert.equal(result.rhythm[0].status,'paused')
 }
 const d=applyTrainingRhythm([easy],DEFAULT_RHYTHM,{...ctx,protectedPhase:true})[0]
 assert.equal(d.kind,'easy');assert.equal(d.rhythm[0].status,'paused')
 assert.equal(applyTrainingRhythm([easy],DEFAULT_RHYTHM,{...ctx,evidence:[{date:today,kind:'rowing',rpe:8} ]})[0].rhythm[0].status,'done')
 assert.equal(applyTrainingRhythm([easy],DEFAULT_RHYTHM,{...ctx,evidence:[{date:'2026-11-25',kind:'strength',rpe:8} ]})[0].rhythm[0].status,'paused')
})
test('before possible track, stability session is shortened and remains gentle',()=>{
 const d=applyTrainingRhythm([free('2026-11-27')],DEFAULT_RHYTHM,{...ctx,options:[{enabled:true,weekday:6,title:'ORC Track',code:'track'}]})[0]
 assert.equal(d.minutes,20)
 assert.match(d.reason,/besonders leicht/)
})
test('calendar prefs, shared coach snapshot and day-only review are wired',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/lib/coachSnapshot.ts'),/trainingRhythm:readRhythm\(\)/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/applyTrainingRhythm\(polarized.days/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/qualityLocked:hardCross\|\|/)
 assert.match(read('src/pages/CalendarPage.tsx'),/<TrainingRhythmSettings/)
 assert.match(read('src/components/CalendarWeekBoard.tsx'),/WUNSCHTAG · PAUSIERT/)
 assert.match(read('src/components/CoachEvidenceSummary.tsx'),/const showWeek=mode==='weekly'/)
 assert.match(read('src/components/TrainingRhythmSettings.tsx'),/saveRhythm\(draft\)/)
})
