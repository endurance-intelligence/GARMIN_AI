import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const checkpoints=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,fluidMlPerHour:500,
 sodiumMgPerHour:500}).checkpoints
const gels=[{minute:20,id:'m100',name:'Gel 100',brand:'Maurten',
 carbsG:25,caffeineMg:0,flavor:'neutral',clock:'06:20',cumulativeCarbsG:25},
 {minute:40,id:'h50',name:'High Energy',brand:'226ERS',
 carbsG:50,caffeineMg:0,flavor:'neutral',clock:'06:40',cumulativeCarbsG:75},
 {minute:650,id:'m100',name:'Gel 100',brand:'Maurten',
 carbsG:25,caffeineMg:0,flavor:'neutral',clock:'16:50',cumulativeCarbsG:850}]

test('runner mode is only next lap and remaining laps, not recorded or planned GPS distance',()=>{
 const a=buildRunnerFocus({checkpoints,completed:0})
 assert.equal(a.nextIndex,1)
 assert.equal(a.remaining,19)
 assert.equal(a.finished,false)
 const b=buildRunnerFocus({checkpoints,completed:11})
 assert.equal(b.nextIndex,12)
 assert.equal(b.remaining,8)
 assert.equal(b.completed,11)
 assert.equal(b.total,19)
 assert.equal(b.finished,false)
 assert.deepEqual(Object.keys(b).filter(k=>/km|mile|pace|delta|buffer|timeLimit/i.test(k)),[])
})
test('only the round immediately before a scheduled extended break flags clothing and shoes',()=>{
 const before=buildRunnerFocus({checkpoints,completed:2})
 assert.equal(before.nextIndex,3)
 assert.equal(before.longPause,true)
 assert.equal(before.breakNote,'Nach dieser Runde: längere Pause für Kleidung und Schuhe.')
 assert.equal(buildRunnerFocus({checkpoints,completed:0}).longPause,false)
 assert.match(buildRunnerFocus({checkpoints,completed:3}).breakNote,/kurze Pause/)
 assert.equal(buildRunnerFocus({checkpoints,completed:5}).longPause,true)
 assert.equal(buildRunnerFocus({checkpoints,completed:17}).longPause,true)
 assert.equal(buildRunnerFocus({checkpoints,completed:18}).longPause,false)
 assert.match(buildRunnerFocus({checkpoints,completed:18}).breakNote,/Ziel/)
})
test('all 19 manually completed segments end without fake final pause or negative remaining',()=>{
 const a=buildRunnerFocus({checkpoints,completed:19})
 assert.equal(a.finished,true)
 assert.equal(a.remaining,0)
 assert.equal(a.nextIndex,null)
 assert.equal(a.breakNote,null)
 assert.equal(buildRunnerFocus({checkpoints,completed:20}).remaining,0)
 assert.equal(buildRunnerFocus({checkpoints,completed:-4}).remaining,19)
})
test('Gel Buddy ownership-based events show selected actual product only at its scheduled time',()=>{
 const before=buildRunnerFocus({checkpoints,completed:0,gelEvents:gels,elapsedMinutes:10})
 assert.equal(before.gelTiming,'upcoming')
 assert.equal(before.gel.name,'Gel 100')
 assert.equal(before.drinkDue,false)
 const now=buildRunnerFocus({checkpoints,completed:0,gelEvents:gels,elapsedMinutes:22})
 assert.equal(now.gelTiming,'due')
 assert.equal(now.gel.name,'Gel 100')
 assert.equal(now.drinkDue,true)
 const second=buildRunnerFocus({checkpoints,completed:0,gelEvents:gels,elapsedMinutes:41})
 assert.equal(second.gelTiming,'due')
 assert.equal(second.gel.brand,'226ERS')
 assert.equal(second.drinkDue,true)
 const later=buildRunnerFocus({checkpoints,completed:0,gelEvents:gels,elapsedMinutes:70})
 assert.equal(later.gelTiming,'upcoming')
 assert.equal(later.gel.minute,650)
 assert.equal(later.drinkDue,false)
})
test('no race clock uses approximate planned round position; never labels product as due NOW',()=>{
 const atStart=buildRunnerFocus({checkpoints,completed:0,gelEvents:gels,elapsedMinutes:null})
 assert.equal(atStart.gelTiming,'upcoming')
 assert.equal(atStart.gel.name,'Gel 100')
 assert.equal(atStart.timingSource,'approximate')
 assert.equal(atStart.drinkDue,false)
 const halfway=buildRunnerFocus({checkpoints,completed:11,gelEvents:gels})
 assert.equal(halfway.gelTiming,'upcoming')
 assert.equal(halfway.gel.minute,650)
 assert.equal(halfway.timingSource,'approximate')
 const unconfigured=buildRunnerFocus({checkpoints,completed:11,gelEvents:null})
 assert.equal(unconfigured.gelTiming,'loading')
 assert.equal(unconfigured.gel,null)
 assert.equal(buildRunnerFocus({checkpoints,completed:0,gelEvents:[]}).gelTiming,'none')
})
test('runner mode UI is pressure-free and does not display distance or time comparisons',()=>{
 const focus=read('src/components/RaceRunnerFocus.tsx')
 const model=read('src/lib/raceRunnerFocus.mjs')
 const driver=read('src/components/RaceDayCockpit.tsx')
 const strategy=read('src/components/RaceStrategyCard.tsx')
 const css=read('src/styles/race-runner-focus.css')
 assert.match(focus,/Runde geschafft/)
 assert.match(focus,/Noch '\+view.remaining/)
 assert.match(focus,/Jetzt trinken/)
 assert.match(focus,/Jetzt Gel: /)
 assert.match(focus,/Nach dieser Runde|view.breakNote/)
 assert.match(model,/längere Pause für Kleidung und Schuhe/)
 assert.match(driver,/<RaceRunnerFocus active=\{active\}/)
 assert.match(driver,/runnerCompleted:nextCompleted/)
 assert.match(driver,/Math.max\(model.recorded,runnerCompleted\)/)
 assert.match(driver,/<details className="rrf-crew">/)
 assert.match(strategy,/<details className="rsp-details">/)
 assert.match(strategy,/Rennplan, Gel Buddy und weitere Einstellungen öffnen/)
 assert.match(css,/@media\(max-width:600px\)/)
 assert.doesNotMatch(focus,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b|\bRückstand\b|\bVorsprung\b/)
 assert.doesNotMatch(model,/distanceKm|gpsDistance|gpsKm/)
 assert.doesNotMatch(focus,/localStorage|\.from\(|fetch\(|geolocation/)
})
