import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runRaceDayPreflight} from '../src/lib/raceDayPreflight.mjs'
import {validateRunnerSnapshot} from '../src/lib/raceRunnerSafety.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const raceDate='2026-11-21'
const raceName='Heartbeat Ultra Fulda'
const key='garmin-ai:race-day:v1:test-athlete|2026-11-21|Heartbeat'
const saved={version:1,raceDate,raceName,runnerCompleted:7,
 runnerTapAt:1795241000000,marks:{},fuelMarks:{'3':'planned',
  '7':'different'},startTime:'06:00'}
function fakeStorage(initial=[]){
 const map=new Map(initial)
 const calls=[]
 const api={
  getItem(k){calls.push(['get',k]);return map.has(k)?map.get(k):null},
  setItem(k,v){calls.push(['set',k]);map.set(k,String(v))},
  removeItem(k){calls.push(['remove',k]);map.delete(k)}
 }
 return {map,calls,api}
}
const preflight=(storage,more={})=>runRaceDayPreflight({
 storage,key,raceDate,raceName,total:19,
 expectedCompleted:7,loaded:true,storageReady:true,
 saved:true,startTime:'06:00',gelEvents:[{minute:20}],
 aidEvents:[{round:1}],...more
})

test('ready check probes ONLY temporary key; preserves real race snapshot byte-for-byte',()=>{
 const original=JSON.stringify(saved)
 const s=fakeStorage([[key,original]])
 const result=preflight(s.api)
 assert.equal(result.status,'ready')
 assert.equal(result.blocked,0)
 assert.equal(result.review,0)
 assert.equal(result.raceLogUntouched,true)
 assert.equal(s.map.get(key),original)
 assert.equal(s.map.size,1)
 const writes=s.calls.filter(([action])=>action==='set')
 assert.equal(writes.length,1)
 assert.notEqual(writes[0][1],key)
 assert.match(writes[0][1],/:preflight-probe-/)
 assert.ok(s.calls.some(([action,k])=>action==='remove'&&k===writes[0][1]))
 assert.equal(validateRunnerSnapshot(JSON.parse(s.map.get(key)),
  {raceDate,raceName,total:19}).completed,7)
 assert.equal(result.checks.length,6)
 assert.match(result.caveat,/Neustart ohne Internet/)
})

test('brand new race can verify storage without creating or advancing any lap',()=>{
 const s=fakeStorage()
 const result=preflight(s.api,{expectedCompleted:0,gelEvents:[],aidEvents:null})
 assert.equal(result.status,'review')
 assert.equal(result.blocked,0)
 assert.equal(s.map.size,0)
 assert.equal(s.calls.some(([action,k])=>action==='set'&&k===key),false)
 assert.ok(result.checks.find(x=>x.id==='aid').status==='review')
})
test('detects stale/missing actual round log instead of silently overwriting it',()=>{
 const s=fakeStorage()
 const result=preflight(s.api)
 assert.equal(result.status,'blocked')
 assert.match(result.checks.find(x=>x.id==='storage').detail,/fehlen sie/)
 assert.equal(s.map.size,0)
 const other=fakeStorage([[key,JSON.stringify({...saved,runnerCompleted:6,
  fuelMarks:{'3':'planned'}})]])
 const mismatch=preflight(other.api)
 assert.equal(mismatch.status,'blocked')
 assert.match(mismatch.checks.find(x=>x.id==='storage').detail,/nicht mit der Ansicht/)
 assert.equal(other.map.get(key),JSON.stringify({...saved,runnerCompleted:6,
  fuelMarks:{'3':'planned'}}))
})
test('wrong event, corrupt JSON and invalid fueling marks block without overwriting any content',()=>{
 for(const value of [
  JSON.stringify({...saved,raceName:'Something else'}),
  JSON.stringify({...saved,fuelMarks:{'9':'planned'}}),
  '{bad JSON'
 ]){
  const s=fakeStorage([[key,value]])
  const result=preflight(s.api)
  assert.equal(result.status,'blocked')
  assert.equal(s.map.get(key),value)
  assert.equal(s.calls.some(([action,k])=>action==='set'&&k===key),false)
 }
})
test('private/disabled storage or denied write cannot report a green check',()=>{
 const disabled=preflight(null)
 assert.equal(disabled.status,'blocked')
 assert.equal(disabled.checks.find(x=>x.id==='storage').status,'blocked')
 const s=fakeStorage([[key,JSON.stringify(saved)]])
 const blocked={
  getItem:s.api.getItem,
  setItem(){throw new Error('Storage quota exceeded')},
  removeItem:s.api.removeItem
 }
 const result=preflight(blocked)
 assert.equal(result.status,'blocked')
 assert.match(result.checks.find(x=>x.id==='storage').detail,/quota/)
 assert.equal(s.map.get(key),JSON.stringify(saved))
 assert.equal(s.map.size,1)
})
test('warnings do not claim missing start, unsaved plan and unavailable food are ready',()=>{
 const s=fakeStorage([[key,JSON.stringify(saved)]])
 const result=preflight(s.api,{saved:false,startTime:'',
  gelEvents:null,aidEvents:null,loaded:false,storageReady:false})
 assert.equal(result.status,'blocked')
 assert.ok(result.checks.find(x=>x.id==='start').status==='review')
 assert.ok(result.checks.find(x=>x.id==='plan').status==='review')
 assert.ok(result.checks.find(x=>x.id==='gel').status==='review')
 assert.ok(result.checks.find(x=>x.id==='aid').status==='review')
 assert.ok(result.checks.find(x=>x.id==='session').status==='blocked')
 const warning=preflight(s.api,{saved:false,startTime:'',
  gelEvents:null,aidEvents:null})
 assert.equal(warning.status,'review')
 assert.equal(warning.blocked,0)
})
test('phone UI check is collapsed, opt-in and never touches race advancement or real localStorage',()=>{
 const ui=read('src/components/RaceDayPreflight.tsx')
 const driver=read('src/components/RaceDayCockpit.tsx')
 const logic=read('src/lib/raceDayPreflight.mjs')
 const styles=read('src/styles/race-day-preflight.css')
 assert.match(ui,/<details className="rdp-root">/)
 assert.match(ui,/Renntag-Check auf diesem Handy/)
 assert.match(ui,/Jetzt auf diesem Gerät prüfen/)
 assert.match(ui,/onClick=\{run\}/)
 assert.match(driver,/<RaceDayPreflight keyName=\{key\}/)
 assert.match(driver,/onComplete=\{completeRunner\} onUndo=\{undoRunner\}/)
 assert.match(logic,/validateRunnerSnapshot\(/)
 assert.match(logic,/preflight-probe-/)
 assert.match(logic,/storage\.removeItem\(probe\)/)
 assert.match(styles,/@media\(max-width:600px\)/)
 assert.doesNotMatch(ui,/onComplete|recordRaceMark|assessRunnerAdvance/)
 assert.doesNotMatch(logic,/storage\.setItem\(key|storage\.removeItem\(key/)
 assert.doesNotMatch(logic,/garminSupabase|navigator\.geolocation|fetch\(/)
})
