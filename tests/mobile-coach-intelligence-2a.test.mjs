import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildDailyTrainingAlternatives,trainingAlternativeForDate,buildGoalProfile} from '../src/lib/goalTrainingFocus.mjs'
import {buildCoachDailyBrief} from '../src/lib/coachDailyBrief.mjs'
const today='2026-11-26'
const day={date:today,kind:'rowing',sport:'other',title:'Rudern',minutes:30,approvable:true,reason:'Locker'}
const fixture=()=>({today,profile:buildGoalProfile({today,goal:{goal:{race_name:'Ultra',race_date:'2027-05-01',distance_km:60}}}),days:[day],boards:[{start:'2026-11-16',activities:[{activity_id:'bike',start_time_local:'2026-11-20T10:00:00',sport_type:'cycling',duration_s:1800}],manual:[]},{start:'2026-11-23',activities:[],manual:[]}],equipment:{available:['rowing','bike','bodyweight'],treadmillMaxInclinePct:null}})
test('rowing and cycling can have one known low-intensity replacement without additional running demand',()=>{
 const input=fixture(),choices=buildDailyTrainingAlternatives(input)
 assert.equal(choices.length,1);assert.equal(choices[0].kind,'cycling');assert.equal(choices[0].minutes,30)
 assert.equal(trainingAlternativeForDate({days:[day],alternatives:choices},today),choices[0])
 const cycle={...day,kind:'cycling',sport:'cycling'}
 input.days=[cycle];input.boards[0].activities[0].sport_type='rowing'
 assert.equal(buildDailyTrainingAlternatives(input)[0].kind,'rowing')
})
test('mobility has a selectable gentle goal-specific strength focus, never an added unit',()=>{
 const input=fixture();input.days=[{...day,kind:'mobility',sport:'strength',minutes:20}]
 const a=buildDailyTrainingAlternatives(input)
 assert.equal(a.length,1);assert.equal(a[0].kind,'strength');assert.equal(a[0].mode,'alternative');assert.equal(a[0].minutes,20)
})
test('protected or already committed sessions never get new alternatives',()=>{
 for(const change of [{protectedPhase:true},{qualityDay:today},{days:[{...day,kind:'long'}]},{days:[{...day,decision:'accepted'}]},{days:[{...day,selectedGroup:{code:'x'}}]},{days:[{...day,kind:'mobility',recoveryMobility:true}]},{equipment:{available:['rowing'],treadmillMaxInclinePct:null}},{days:[day,{date:'2026-11-27',kind:'race'}]}])assert.deepEqual(buildDailyTrainingAlternatives({...fixture(),...change}),[])
})
test('quality is surfaced exactly from the daily decision including contraindicated saved quality',()=>{
 for(const intent of ['planned','candidate',undefined]){
  const d={...day,kind:'existing',qualityIntent:intent,qualityBlocked:true}
  const b=buildCoachDailyBrief({today,plan:{days:[d]}})
  assert.equal(b.qualityIntent,intent||null);assert.equal(b.qualityBlocked,true)
 }
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/components/CoachDailyBrief.tsx'),/<TrainingQualityMark intent=\{brief.qualityIntent\} blocked=\{brief.qualityBlocked\} today\/>/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/\['rowing','cycling','mobility'\].includes\(original.kind\)/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/replacementImpact\(budgetFor\(rhythmDays,a.date\),a.date\)/)
 assert.match(read('src/components/CoachSevenDay.tsx'),/choice.kind==='strength'\?'strength'/)
 assert.match(read('src/components/CoachSevenDay.tsx'),/JSON.stringify\(next\)!==JSON.stringify\(choice\)/)
})
