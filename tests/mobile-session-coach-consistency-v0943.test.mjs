import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('live Session Intelligence has no demo verdict, no fake fueling and no stale Garmin workout snapshot',()=>{
 const page=read('src/pages/TrainingPage.tsx')
 assert.match(page,/<LiveSessionAnalyst active=\{active\}\/>/)
 assert.match(page,/<AerobicEvidencePanel active=\{active&&aerobicOpen\}\/>/)
 assert.match(page,/Aerobe Vergleichsläufe · vertiefende Analyse/)
 assert.doesNotMatch(page,/GarminConnectSnapshot|demoSessions|session\.grade|Einnahme simulieren|BEISPIELANALYSEN|session-score|fuel-demo-log/)
 assert.match(page,/Keine künstlichen Trainingsnoten/)
})
test('live session keeps measured data separate from manual training intention',()=>{
 const view=read('src/components/LiveSessionAnalyst.tsx')
 assert.match(view,/analysis\.signals\.filter\(signal=>signal\.title!=='Trainingsziel noch nicht hinterlegt'\)/)
 assert.match(view,/separat und nur nach deiner Zuordnung bewertet/)
 assert.match(view,/<SessionGoalReview/)
 assert.match(view,/Runden nicht übermittelt/)
})
test('aerobic analysis is optional and import diagnostics are behind disclosure',()=>{
 const page=read('src/pages/TrainingPage.tsx')
 const evidence=read('src/components/AerobicEvidencePanel.tsx')
 assert.match(page,/onToggle=\{event=>setAerobicOpen\(event\.currentTarget\.open\)\}/)
 assert.match(evidence,/<details className="ae-diagnostics">/)
 assert.match(evidence,/Datenabdeckung &amp; Importdiagnose/)
 assert.match(evidence,/data\.comparable\.slice\(0,3\)/)
 assert.match(evidence,/data\.comparable\.slice\(3\)/)
})
test('Coach overview only treats explicitly selected club option as a fixed workout',()=>{
 const view=read('src/components/CoachGlance.tsx')
 assert.match(view,/attendance\(w\)==='selected'/)
 assert.match(view,/attendance\(w\)==='open'/)
 assert.match(view,/Optional:/)
 assert.match(view,/Offene Wochenoption · noch nicht zugesagt/)
})
test('Coach respects illness, returning status, vacation blocks and missing source data',()=>{
 const view=read('src/components/CoachGlance.tsx')
 assert.match(view,/get\('garmin-coach-context',token\)/)
 assert.match(view,/context\?\.illness_state==='sick'/)
 assert.match(view,/context\?\.illness_state==='returning'/)
 assert.match(view,/dateBlock\?\.reason==='vacation'/)
 assert.match(view,/Trainingskalender nicht vollständig erreichbar/)
 assert.match(view,/!view\.availabilityOk/)
 assert.match(view,/\?\?/)
})
test('sync separates automated Garmin activities/health from optional old manual reads',()=>{
 const view=read('src/components/SyncCenter.tsx')
 assert.match(view,/const automaticRows=\[/)
 assert.match(view,/const manualRows=\[/)
 assert.match(view,/className="sync-manual-imports"/)
 assert.match(view,/Für Ausrüstung ist noch ein eigenständiger automatischer Import nötig/)
 assert.match(view,/Coach → Intervals\.icu → Garmin-Uhr/)
})
