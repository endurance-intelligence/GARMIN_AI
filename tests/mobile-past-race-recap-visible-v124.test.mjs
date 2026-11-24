import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessRaceOutcome,listRaceDayActivities} from '../src/lib/raceOutcome.mjs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const race={raceDate:'2026-11-21',raceName:'Heartbeat Ultra Fulda',raceDistanceKm:112}
const activity={activity_id:'heartbeat-real-recording-synthetic',
 activity_name:'Heartbeat Ultra',sport_type:'ultra_run',
 start_time_local:'2026-11-21 06:00:00',duration_s:22680,distance_m:50700,
 rpe_raw:70,feeling_raw:50}

test('completed race recap is in open Race Prep section BEFORE the collapsed Gel Buddy settings',()=>{
 const ui=read('src/components/RaceStrategyCard.tsx')
 assert.match(ui,/const isPastRace=Boolean\(goal&&goal\.race_date<berlinDateToday\(\)\)/)
 assert.match(ui,/isPastRace\?'Rennrückblick · Garmin zuordnen'/)
 assert.match(ui,/isPastRace\?'WETTKAMPF BEENDET \/ RÜCKBLICK'/)
 assert.match(ui,/isPastRace\?'Rennen beendet'/)
 const open=ui.indexOf('<div className="rsp-body">')
 const recap=ui.indexOf('{isPastRace&&<RaceAfterActionCard')
 const runner=ui.indexOf('<RaceDayCockpit')
 const hidden=ui.indexOf('<details className="rsp-details">')
 assert.ok(open>=0&&recap>open&&recap<runner&&runner<hidden,
  'Race recap must appear before live runner and nested, collapsed settings')
 assert.equal((ui.match(/<RaceAfterActionCard/g)||[]).length,1,
  'The recap must not be duplicated in an inaccessible collapsed section')
 assert.match(ui,/return <details className="rsp-root" open /)
})

test('heartbeat stays unlinked until explicit athlete confirmation in exposed recap',()=>{
 const board={activities:[activity]}
 const eligible=listRaceDayActivities({raceDate:race.raceDate,board})
 assert.equal(eligible.length,1)
 assert.equal(eligible[0].distanceKm,50.7)
 const before=assessRaceOutcome({...race,board,plannedMinutes:900})
 assert.equal(before.matchStatus,'unavailable')
 const after=assessRaceOutcome({...race,board,plannedMinutes:900,
  links:[{raceDate:race.raceDate,raceName:race.raceName,
   activityId:activity.activity_id,confirmedOn:'2026-11-24'}]})
 assert.equal(after.matchStatus,'confirmed')
 assert.equal(after.partial,true)
 assert.equal(after.actualKm,50.7)
 assert.equal(after.planDeltaMinutes,null)
})

test('Race Prep page still mounts RaceStrategyCard directly and no new data writes',()=>{
 const page=read('src/pages/RacePage.tsx')
 const ui=read('src/components/RaceStrategyCard.tsx')
 const detail=read('src/components/RaceAfterActionCard.tsx')
 assert.match(page,/<RaceStrategyCard active=\{active\}/)
 assert.match(detail,/Diesen Garmin-Lauf dem Wettkampf zuordnen/)
 assert.match(detail,/Zuordnung wieder lösen/)
 assert.match(detail,/input|selected|changeLink/)
 assert.ok(!ui.includes('.upsert({race_activity_links'))
})
