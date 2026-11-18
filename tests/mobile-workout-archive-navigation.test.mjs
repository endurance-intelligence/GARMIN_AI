import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('trainer archive includes search through title, trainer and every group',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/record\.title,record\.coach_name,record\.source_label/)
 assert.match(ui,/\.\.\.record\.workout\.groups\.map\(g=>g\.name\)/)
 assert.match(ui,/type="search" value=\{search\}/)
 assert.match(ui,/\{shown\.map\(record=>/)
})
test('older trainer sessions stay reachable via owner-only private pagination',()=>{
 const server=read('supabase/functions/garmin-workout-archive/index.ts')
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(server,/new URL\(req\.url\)\.searchParams\.get\('page'\)/)
 assert.match(server,/Number\(page\)>50/)
 assert.match(server,/\.range\(offset,offset\+100\)/)
 assert.match(server,/nextPage:\(data\|\|\[\]\)\.length>100/)
 assert.match(ui,/callArchive<ArchiveResponse>\(undefined,nextPage\)/)
 assert.match(ui,/Weitere 100 Vorlagen laden/)
 assert.match(server,/user\.email_confirmed_at/)
})
test('trainer original is never edited in place; copying makes new reviewed version',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 const server=read('supabase/functions/garmin-workout-archive/index.ts')
 assert.match(ui,/begin\(structuredClone\(record\.workout\),'manual'\)/)
 assert.match(ui,/Als neue Version bearbeiten/)
 assert.match(ui,/requestId\.current=crypto\.randomUUID\(\)/)
 assert.match(server,/body\.action==='save'/)
 assert.doesNotMatch(server,/\.update\(\{.*workout/)
})
test('archive remains a private draft-only source for future coach use',()=>{
 const sql=read('supabase/migrations/20261110084000_dynamic_workout_archive_v0913.sql')
 assert.match(sql,/archive_snapshot/)
 assert.match(sql,/'draft',v\.id,p_group/)
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/Coach-Auswahl bleiben bis zur separaten Prüfung deaktiviert/)
 assert.doesNotMatch(ui,/scheduleWorkout\(|uploadWorkout\(/)
})
