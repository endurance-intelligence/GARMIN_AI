import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSessionContext} from '../src/lib/sessionContext.mjs'
import {heartZoneDistribution} from '../src/lib/trainingVisuals.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const activity={id:'r',sport:'running',date:'2026-11-25 19:00:00',distanceM:10010,durationS:3840,avgHr:135,rpeRaw:30}
const ultra={...activity,id:'u',date:'2026-11-21 06:00:00',distanceM:50700,durationS:28800}
test('six distinct measured evidence cards, pace and optional recovery',()=>{
 const r=buildSessionContext(activity,[ultra,activity],[{startDistanceM:0,endDistanceM:2700,gradePct:4},{startDistanceM:2700,endDistanceM:5700,gradePct:-4}],{felt:-7,temperature:-2,location:'Oerlinghausen',hour:'19:00'})
 assert.equal(r.cards.length,6)
 assert.equal(r.cards.find(c=>c.key==='effort').value,'3/10')
 assert.equal(r.cards.find(c=>c.key==='prior').value,'50,7')
 assert.equal(r.cards.find(c=>c.key==='duration').tone,'caution')
 assert.equal(r.cards.find(c=>c.key==='terrain').value,'5,7')
 assert.match(r.cards.find(c=>c.key==='terrain').detail,/nicht Höhenmeter/)
 assert.equal(r.cards.find(c=>c.key==='weather').value,'-7')
 assert.equal(r.paceText,'6:24')
 assert.match(r.next,/optional 5–10 Minuten sanfte Mobility/)
 assert.equal(r.mode,'caution')
})
test('missing values do not become zero or positive clearance',()=>{
 const r=buildSessionContext({...activity,avgHr:null,durationS:null,distanceM:null,rpeRaw:null},[])
 assert.equal(r.cards.find(c=>c.key==='hr').value,'–')
 assert.equal(r.cards.find(c=>c.key==='terrain').value,'–')
 assert.equal(r.cards.find(c=>c.key==='weather').value,'–')
 assert.equal(r.paceText,'–')
 assert.notEqual(r.mode,'positive')
})
test('same samples and different boundaries change distribution only',()=>{
 const samples=Array.from({length:100},(_,i)=>({hr:i<74?135:i<94?148:164}))
 const a=heartZoneDistribution(samples,[142,151,159,168,173,178,186])
 const b=heartZoneDistribution(samples,[108,126,144,162,181])
 assert.equal(a.valid,b.valid)
 assert.equal(a.bands.slice(0,2).reduce((n,x)=>n+x.count,0),94)
 assert.equal(b.bands[2].count,74)
})
test('one switchable zone panel, no second Garmin chart, actual same-activity HF summary',()=>{
 const visual=read('src/components/SessionVisualInsights.tsx'),detail=read('src/components/SessionIntensityDetails.tsx'),coach=read('src/components/LiveSessionAnalyst.tsx')
 assert.match(visual,/useState<'hr'\|'pace'\|'info'>\('hr'\)/)
 assert.match(visual,/useState<'intervals'\|'garmin'>\('intervals'\)/)
 assert.match(visual,/heartZoneDistribution\(samples,zones\?\.hrZones\)/)
 assert.match(visual,/assessIntensity\(samples,garminRef.profile\)/)
 assert.match(visual,/useGarminHrProfile\(active&&garminOpen\)/)
 assert.match(visual,/hrBands.bands.slice\(0,2\).reduce\(\(n,b\)=>n\+b.count,0\)/)
 assert.match(visual,/aktuell verfügbare Intervals.icu-Zonen/)
 assert.match(visual,/nicht rückwirkend bestätigt/)
 assert.doesNotMatch(detail,/<IntensityEvidencePanel/)
 assert.match(coach,/zoneSummary\?\.activityId===details.activity.id/)
 assert.match(coach,/context.cards.map/)
 assert.match(coach,/onZoneSummary=\{setZoneSummary\}/)
})
