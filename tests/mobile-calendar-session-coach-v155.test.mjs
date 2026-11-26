import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSessionContext} from '../src/lib/sessionContext.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const ultra={id:'u',date:'2026-11-21 06:00:00',sport:'running',distanceM:50000,durationS:30000,avgHr:130,rpeRaw:80}
const run={id:'r',date:'2026-11-25 19:00:00',sport:'running',distanceM:10000,durationS:3840,avgHr:135,rpeRaw:30}
const terrain=[{startDistanceM:0,endDistanceM:100,gradePct:4},{startDistanceM:100,endDistanceM:200,gradePct:-4}]
test('post-ultra easy feeling is positive, duration and terrain remain context, not false clearance',()=>{
 const r=buildSessionContext(run,[ultra,run],terrain,-6)
 assert.match(r.verdict,/Gutes Belastungsgefühl/)
 assert.match(r.verdict,/eher lang/)
 assert.equal(r.mood,'firm')
 assert.match(r.factors.find(f=>f.label==='Wettkampf / Vorbelastung').text,/Erster erfasster Lauf 4 Tage nach 50 km/)
 assert.match(r.factors.find(f=>f.label==='Herzfrequenz').text,/135 bpm/)
 assert.match(r.factors.find(f=>f.label==='Streckenprofil').text,/100 m Streckenlänge bergauf/)
 assert.match(r.factors.find(f=>f.label==='Wetter / gefühlte Temperatur').text,/-6 °C gefühlt/)
})
test('missing weather, terrain and RPE are not fabricated; later sessions not used as previous',()=>{
 const r=buildSessionContext({...run,rpeRaw:null},[{...ultra,date:'2026-11-27 06:00:00'}])
 assert.match(r.verdict,/eingeschränkt/)
 assert.match(r.factors.find(f=>f.label==='Wetter / gefühlte Temperatur').text,/Keine verifizierten/)
 assert.match(r.factors.find(f=>f.label==='Streckenprofil').text,/nicht bewertet/)
 assert.match(r.factors.find(f=>f.label==='Wettkampf / Vorbelastung').text,/Keine vorausgehende/)
})
test('calendar uses the same loaded week data, opens exact activity and suppresses false empty message',()=>{
 const board=read('src/components/CalendarWeekBoard.tsx'),page=read('src/pages/CalendarPage.tsx'),app=read('src/App.tsx'),analyst=read('src/components/LiveSessionAnalyst.tsx')
 assert.match(board,/onActivities\?\.\(visibleData/)
 assert.match(page,/weekActivities\?\.start===start/)
 assert.match(page,/onOpenSession\(String\(a.activity_id\)\)/)
 assert.match(page,/!completedActivities.length&&<div className="hc-empty">/)
 assert.match(app,/<CalendarPage[^\n]+onOpenSession=\{openSession\}/)
 assert.match(analyst,/<CoachAvatar mood=\{context.mood\}/)
})
test('optional gentle mobility remains visible on accepted recovery without rewriting the decision',()=>{
 const today='2026-11-26'
 const input={today,health:{metrics:[],training:{runKm7:50,previousRunKm7:40,historyStatus:'complete',truncated:false}},
 boards:[],goal:{goal:{race_date:'2026-11-21',race_name:'Ultra',distance_km:112}},
 life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[],race_recovery_checks:[],day_decisions:[{date:today,choice:'accepted'}]},runs:[]}}
 const d=buildSevenDayCoach(input).days[0]
 assert.equal(d.kind,'recovery');assert.equal(d.recoveryMobility,true);assert.equal(d.decision,'accepted');assert.equal(d.approvable,false)
 input.symptoms=true;assert.equal(buildSevenDayCoach(input).days[0].recoveryMobility,undefined)
 assert.ok(coachAddDays(today,1))
})

test('modeled weather is distinguished from athlete input and only requested for matched saved group',()=>{
 const r=buildSessionContext(run,[ultra,run],terrain,{felt:-6,temperature:-2,location:'Oerlinghausen',hour:'19:00'})
 const weather=r.factors.find(f=>f.label==='Wetter / gefühlte Temperatur').text
 assert.match(weather,/historisches Wettermodell/)
 assert.match(weather,/gefühlt -6 °C/)
 const view=read('src/components/LiveSessionAnalyst.tsx')
 assert.ok(view.includes("c.choice==='selected'"))
 assert.ok(view.includes('candidates.length!==1'))
 assert.ok(view.includes('historical-forecast-api.open-meteo.com'))
 assert.ok(view.includes('scrollIntoView'))
})
