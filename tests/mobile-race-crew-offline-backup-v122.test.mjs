import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'
import {buildRaceFuelRoadmap} from '../src/lib/raceFuelRoadmap.mjs'
import {eventMenuForRace} from '../src/lib/raceEventMenu.mjs'
import {buildRaceCrewBackup} from '../src/lib/raceCrewBackup.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const eventMenu=eventMenuForRace({raceName:'Heartbeat Ultra Fulda',raceDate:'2026-11-21'})
const checkpoints=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,
 longStopMinutes:8,paceSeconds:null,targetHours:15,carbsGPerHour:75,
 fluidMlPerHour:500,sodiumMgPerHour:500}).checkpoints
const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'160',
 aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
 aid_food_name:'',aid_food_carbs_g_per_stop:0}
const aid=buildAidPlan({checkpoints,settings,startTime:'06:00'})
const gelEvents=[
 {minute:20,clock:'06:20',brand:'Maurten',name:'Gel 100',
  carbsG:25,caffeineMg:0,planOnly:true},
 {minute:220,clock:'09:40',brand:'226ERS',name:'High Energy Gel',
  carbsG:50,caffeineMg:0,planOnly:true},
 {minute:720,clock:'18:00',brand:'Maurten',name:'Gel 100 CAF 100',
  carbsG:25,caffeineMg:100,planOnly:true}
]
const plan=buildRaceFuelRoadmap({checkpoints,gelEvents,aidEvents:aid.events,
 eventMenu,targetCarbsGPerHour:75,ownDrinkCarbsGPerHour:0})
const sheet=()=>buildRaceCrewBackup({raceName:'Heartbeat Ultra Fulda',
 raceDate:'2026-11-21',startTime:'06:00',roadmap:plan,eventMenu,
 gelScheduleReady:true,aidScheduleReady:true,planSaved:true})
test('19 complete Heartbeat rounds produce a readable and faithful offline crew backup',()=>{
 const output=sheet()
 assert.equal(output.status,'ready')
 assert.equal(output.roundCount,19)
 assert.deepEqual(output.warnings,[])
 const lines=output.text.split('\n')
 assert.equal(lines.filter(x=>x.startsWith('RUNDE ')).length,19)
 assert.match(output.text,/RUNDE 01\/19/)
 assert.match(output.text,/RUNDE 19\/19/)
 assert.match(output.text,/Ankunft 06:42 Uhr/)
 assert.match(output.text,/Ankunft 20:46 Uhr/)
 assert.match(output.text,/RUNDE 03\/19.*LANGE PAUSE 11 Min\./)
 assert.match(output.text,/RUNDE 06\/19.*LANGE PAUSE 11 Min\./)
 assert.match(output.text,/RUNDE 09\/19.*LANGE PAUSE 11 Min\./)
 assert.match(output.text,/RUNDE 12\/19.*LANGE PAUSE 11 Min\./)
 assert.match(output.text,/RUNDE 15\/19.*LANGE PAUSE 11 Min\./)
 assert.match(output.text,/RUNDE 18\/19.*LANGE PAUSE 11 Min\./)
 assert.equal((output.text.match(/LANGE PAUSE 11 Min\./g)||[]).length,6)
 assert.match(output.text,/RUNDE 19\/19.*ZIEL – keine weitere Versorgungsstation angenommen/)
 assert.match(output.text,/Gel laut Plan: Maurten · Gel 100/)
 assert.match(output.text,/Gel 100 CAF 100/)
 assert.match(output.text,/Koffein-Gel laut Plan: 100 mg/)
 assert.equal((output.text.match(/Koffein-Gel laut Plan:/g)||[]).length,1)
 assert.match(output.text,/250 ml Maurten Drink Mix 160/)
 assert.match(output.text,/MAURTEN Drink Mix 160 aus großem Behälter verfügbar/)
 assert.match(output.text,/40 g KH je 500 ml/)
 assert.match(output.text,/keine weitere Versorgungsstation/)
 assert.match(output.text,/NUR PLANUNG.*Keine Nahrung oder Getränke als tatsächlich aufgenommen bestätigt/)
 assert.match(output.text,/Essen an Station:.*Portions-KH NICHT angerechnet/)
 assert.match(output.text,/Uhrzeiten nur Sollwerte/)
 assert.match(output.text,/keine GPS-Kilometer/)
 assert.doesNotMatch(output.text,/Restkilometer|Kilometer verbleibend|Versorgung garantiert an jeder Station/)
})
test('backup does not suggest 0 ml means drink was consumed or imply glucose coverage',()=>{
 const zeroAid=buildAidPlan({checkpoints,settings:{...settings,
  aid_drink_ml_per_stop:0}})
 const roadmap=buildRaceFuelRoadmap({checkpoints,gelEvents:[],aidEvents:zeroAid.events,
  eventMenu,targetCarbsGPerHour:75})
 const output=buildRaceCrewBackup({raceName:'Heartbeat Ultra Fulda',raceDate:'2026-11-21',
  startTime:'06:00',roadmap,eventMenu,gelScheduleReady:true,aidScheduleReady:true,
  planSaved:true})
 assert.equal(zeroAid.drinkCarbsG,0)
 assert.equal(output.status,'ready')
 assert.match(output.text,/Gel laut Plan: keines in dieser Runde/)
 assert.match(output.text,/NOCH ZU PRÜFEN/)
 assert.match(output.text,/Kein Gel im aktuellen Plan eingeplant/)
 assert.match(output.text,/Keine feste Ausgabemenge|Keine feste Ausgabemenge|Keine feste Ausgabemenge|Keine feste Ausgabemenge|nicht unbegrenzt trinken/)
 assert.doesNotMatch(output.text,/250 ml Maurten Drink Mix 160/)
 assert.match(output.text,/Menge ungeklärt, keine KH angerechnet/)
})
test('backup clearly warns for no saved settings, missing gel data and unconfirmed aid',()=>{
 const output=buildRaceCrewBackup({raceName:'Heartbeat Ultra Fulda',
  raceDate:'2026-11-21',startTime:'06:00',roadmap:plan,eventMenu,
  gelScheduleReady:false,aidScheduleReady:false,planSaved:false})
 assert.equal(output.status,'partial')
 assert.match(output.text,/UNVOLLSTÄNDIGE VORSCHAU/)
 assert.ok(output.warnings.some(w=>w.includes('nicht gespeichert')))
 assert.ok(output.warnings.some(w=>w.includes('Gel-Plan')))
 assert.ok(output.warnings.some(w=>w.includes('Verpflegungsplan')))
 assert.equal(output.roundCount,19)
 assert.equal(buildRaceCrewBackup({roadmap:null}).status,'missing')
 assert.equal(buildRaceCrewBackup({roadmap:{rounds:[]}}).status,'missing')
 assert.equal(buildRaceCrewBackup({roadmap:{rounds:[{round:2,arrivalMinutes:42,
  pauseMinutes:3,finish:false}]}}).status,'missing')
})
test('unknown start never gets invented clocks; no fabricated on-site stop after finish',()=>{
 const output=buildRaceCrewBackup({raceName:'Some race',raceDate:'2026-11-21',
  startTime:'',roadmap:plan,gelScheduleReady:true,aidScheduleReady:true,planSaved:true})
 assert.match(output.text,/Startzeit nicht bestätigt/)
 assert.match(output.text,/Ankunft \+0h 42m/)
 assert.doesNotMatch(output.text,/Ankunft 06:42 Uhr/)
 const last=output.text.split('\n').find(x=>x.startsWith('RUNDE 19/19'))
 assert.match(last,/ZIEL – keine weitere Versorgungsstation angenommen/)
})
test('custom gel text is sanitized against forged multiline crew instructions',()=>{
 const altered=JSON.parse(JSON.stringify(plan))
 altered.rounds[0].gelNames=['Gel X\nRUNDE 99/99 START NOW']
 const output=buildRaceCrewBackup({raceName:'Heartbeat Ultra Fulda',
  raceDate:'2026-11-21',startTime:'06:00',roadmap:altered,
  gelScheduleReady:true,aidScheduleReady:true,planSaved:true})
 assert.equal(output.text.split('\n').filter(x=>x.startsWith('RUNDE ')).length,19)
 assert.match(output.text,/Gel X RUNDE 99\/99 START NOW/)
})
test('UI only exports on explicit action, after saved settings, with copy and TXT fallback',()=>{
 const ui=read('src/components/GelInventoryPlanner.tsx')
 const mod=read('src/lib/raceCrewBackup.mjs')
 const css=read('src/styles/gel-inventory.css')
 const icon=read('src/components/Icon.tsx')
 const runner=read('src/components/RaceRunnerFocus.tsx')
 assert.match(ui,/buildRaceCrewBackup/)
 assert.match(ui,/const canExportCrew=backupSaved&&crewBackup.status!=='missing'/)
 assert.match(ui,/setHasSavedPrefs\(Boolean\(prefs.data\)\)/)
 assert.match(ui,/setHasSavedPrefs\(true\)/)
 assert.match(ui,/Crew-Spickzettel für den Renntag sichern/)
 assert.match(ui,/<details className="gip-crew-backup">/)
 assert.match(ui,/navigator.clipboard.writeText\(crewBackup.text\)/)
 assert.match(ui,/onClick=\{downloadCrewBackup\}/)
 assert.match(ui,/URL.createObjectURL\(blob\)/)
 assert.match(ui,/new Blob\(\[crewBackup.text\]/)
 assert.match(ui,/gip-crew-text/)
 assert.match(ui,/settingsDirty/)
 assert.match(ui,/canExportCrew/)
 assert.match(css,/gip-crew-backup/)
 assert.match(css,/@media\(max-width:650px\)/)
 assert.match(icon,/"clipboard-list":/)
 assert.match(icon,/"download":/)
 assert.match(icon,/"file-text":/)
 assert.match(icon,/"copy":/)
 assert.doesNotMatch(runner,/raceCrewBackup|crewText|exportCrew|backupSaved/)
 assert.doesNotMatch(mod,/fetch\(|(?:localStorage|supabase|navigator|window)\s*\./)
 assert.doesNotMatch(ui,/supabase.*crewBackup|upsert.*crewBackup/)
})
