import test from 'node:test'
import assert from 'node:assert/strict'
import {answerCoachQuestion,resolveCoachQuestion} from '../src/lib/askCoach.mjs'
const today='2026-11-25',plan={today,days:[{date:today,kind:'easy',title:'Locker',reason:'Coach reason',minutes:30}]}
const a={activity_id:'1',start_time_local:'2026-11-24T18:00:00',sport_type:'running',distance_m:6000,duration_s:2160,average_heart_rate:135}
const b={...a,activity_id:'2',start_time_local:'2026-11-23T18:00:00',distance_m:5000,duration_s:1800}
const snapshot={boards:[{start:'2026-11-23',activities:[a,b,a,{...a,activity_id:'3',sport_type:'cycling'}]}],health:{},plans:{entries:[]}}
const ask=q=>answerCoachQuestion({topic:resolveCoachQuestion(q),today,snapshot,plan,query:q})
test('local coach reads actual run pace, pulse and distance, without duplicate activities',()=>{
 assert.match(ask('Wie schnell war mein letzter Lauf?').body.join(' '),/6 km.*6:00 min\/km.*135 bpm/)
 assert.match(ask('Wie viele Kilometer bin ich diese Woche gelaufen?').body.join(' '),/11 km/)
 assert.match(ask('Wie viele Kilometer bin ich letzte Woche gelaufen?').body.join(' '),/nicht vollständig/)
 assert.match(ask('Vergleich letzter Lauf').body.join(' '),/5 km/)
})
test('method and load questions route separately; unrelated questions remain unknown',()=>{
 assert.equal(resolveCoachQuestion('Was bedeutet polarisiertes Training?'),'method')
 assert.equal(resolveCoachQuestion('Wie ist meine aktuelle Trainingsbelastung?'),'load')
 assert.equal(resolveCoachQuestion('Welche Farbe hat eine Orange?'),null)
 assert.equal(resolveCoachQuestion('Schmerzen beim letzten Lauf'),'symptoms')
 assert.match(ask('Was bedeutet polarisiertes Training?').body.join(' '),/80\/20/)
})
