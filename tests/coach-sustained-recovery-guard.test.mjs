import test from 'node:test'
import assert from 'node:assert/strict'
import {coachAddDays,buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const today='2026-11-28',day=n=>coachAddDays(today,n)
const fixture=()=>({
 today,health:{metrics:Array.from({length:30},(_,i)=>({metric_date:day(i-29),hrv_ms:i<16?60:26,resting_heart_rate:45,sleep_seconds:27000})),training:{runKm7:40,previousRunKm7:40,historyStatus:'complete',truncated:false}},
 boards:[{activities:[],manual:[]}],options:{options:[],choices:[]},plans:{entries:[]},goal:{goal:{race_date:'2027-04-25',race_name:'Testziel'}},symptoms:false
})
test('sustained suppression is not hidden by an adapted rolling median and prevents progression',()=>{
 const p=buildSevenDayCoach(fixture())
 assert.equal(p.attention,true)
 assert.match(p.attentionText,/HRV/)
 assert.equal(p.days[0].kind,'recovery')
 assert.equal(p.days[1].kind,'recovery')
 assert.ok(p.days.every(d=>!['intervals','tempo','long','quality'].includes(d.kind)))
 assert.equal(p.adaptiveVolume.status,'protected')
})
test('existing plans and actual activity stay visible; selected club session remains recorded',()=>{
 const data=fixture()
 data.plans.entries=[{training_date:today,state:'confirmed',title:'Bestehender Termin',sport:'running'}]
 data.boards[0].activities=[{activity_id:'1',start_time_local:day(1)+'T08:00:00',sport_type:'running'}]
 data.options.options=[{code:'track',weekday:6,title:'ORC Track',sport:'running',enabled:true}]
 data.options.choices=[{option_code:'track',training_date:today,choice:'selected'}]
 const p=buildSevenDayCoach(data)
 assert.equal(p.days[0].kind,'existing')
 assert.equal(p.days[0].approvable,false)
 assert.equal(p.days[0].selectedGroup?.advice,'skip')
 assert.match(p.days[0].reason,/HRV/)
 assert.equal(p.days[1].kind,'completed')
})
test('missing earlier reference and stale HRV do not trigger sustained recovery guard',()=>{
 const noRef=fixture();noRef.health.metrics=noRef.health.metrics.slice(-14)
 assert.doesNotMatch(buildSevenDayCoach(noRef).attentionText,/HRV bleibt|HRV liegt seit vielen Tagen/)
 const stale=fixture();stale.health.metrics=stale.health.metrics.map(x=>x.metric_date>=day(-2)?{...x,hrv_ms:null}:x)
 assert.doesNotMatch(buildSevenDayCoach(stale).attentionText,/HRV bleibt|HRV liegt seit vielen Tagen/)
})
