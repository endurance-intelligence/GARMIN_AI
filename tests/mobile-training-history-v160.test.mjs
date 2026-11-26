import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {makePlanSnapshot,historyModel,monthBounds,collectActual,summarizeEntries} from '../src/lib/trainingHistory.mjs'
const start='2026-11-30',today='2026-12-02'
const budget={start,phaseLabel:'Aufbau',target:{low:40,high:45},paceSeconds:360,proposedParts:[{date:'2026-12-03',km:8}]}
const snapshot=makePlanSnapshot({budget,today,days:[{date:'2026-12-03',kind:'easy',sport:'running',title:'Laufen',minutes:48,approvable:true},{date:'2026-12-04',kind:'rowing',sport:'other',title:'Rudern',minutes:30,approvable:true},{date:'2026-12-05',kind:'mobility',sport:'strength',title:'Stabi',minutes:30,approvable:true},{date:'2026-12-06',kind:'recovery',sport:'running',title:'Ruhe',approvable:false}],plans:[{training_date:'2026-11-30',state:'confirmed',sport:'running',title:'Lauf'},{training_date:'2026-12-03',state:'cancelled',sport:'running',title:'Abgebrochen'}],options:[{code:'football-mon',sport:'football',title:'Fußball'}],choices:[]})
const activity=(id,date,sport,distance_m=0,duration_s=1800)=>({activity_id:id,start_time_local:date+'T09:00',sport_type:sport,distance_m,duration_s})
test('capture dated plan entries, original target, and partial week without inventing earlier plans',()=>{
 assert.equal(snapshot.partial,true)
 assert.deepEqual(snapshot.target,{low:40,high:45})
 assert.equal(snapshot.entries.length,4)
 assert.deepEqual(snapshot.entries.map(x=>x.kind),['running','running','rowing','strength'])
 assert.equal(snapshot.entries[1].km,8)
 assert.equal(snapshot.entries[0].km,null)
})
test('actual data deduplication and sport separation',()=>{
 const rows=collectActual([activity('r','2026-12-01','running',10000,3600),activity('r','2026-12-01','running',10000,3600),activity('row','2026-12-02','indoor_rowing',5000),activity('bike','2026-12-02','cycling',30000),activity('future','2026-12-03','running',10000)], [{id:'m',session_date:'2026-12-02',kind:'rowing',duration_minutes:30},{id:'s',session_date:'2026-12-02',kind:'strength',duration_minutes:25}],today)
 const s=summarizeEntries(rows,'2026-12-01','2026-12-31')
 assert.equal(s.total,4);assert.equal(s.runKm,10)
 assert.equal(s.rows.find(x=>x.kind==='rowing').count,1)
 assert.equal(s.rows.find(x=>x.kind==='cycling').count,1)
 assert.equal(s.rows.find(x=>x.kind==='strength').count,1)
})
test('calendar month counts only dates within month while full ISO week includes November',()=>{
 const revisions=[{id:'1',week_start:start,created_at:'2026-11-30T10:00:00Z',snapshot},{id:'2',week_start:start,created_at:'2026-12-02T10:00:00Z',snapshot:{...snapshot,entries:snapshot.entries.filter(e=>e.kind!=='rowing')}}]
 const model=historyModel({month:'2026-12',today,activities:[activity('nov','2026-11-30','running',12000),activity('dec','2026-12-01','running',10000)],revisions})
 assert.equal(model.actual.runKm,10)
 assert.equal(model.weeks[0].actual.runKm,22)
 assert.equal(model.weeks[0].versions,2)
 assert.equal(model.weeks[0].original.rows[1].count,1)
 assert.equal(model.weeks[0].planned.rows[1].count,0)
 assert.equal(model.savedWeeks,1)
 assert.equal(model.weeks[1].planned,null)
 assert.equal(monthBounds('2026-13'),null)
})
test('private append-only endpoint and integration use explicit user save',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const edge=read('supabase/functions/garmin-training-history/index.ts')
 assert.match(edge,/auth.auth.getUser/)
 assert.match(edge,/user.email.*!==owner/)
 assert.match(edge,/\.insert\(row\)/)
 assert.doesNotMatch(edge,/\.upsert\(|\.update\(|\.delete\(/)
 assert.match(edge,/\.eq\('user_id',user.id\)/)
 assert.match(read('src/pages/CalendarPage.tsx'),/<TrainingWeekArchive/)
 assert.match(read('src/pages/TrainingPage.tsx'),/<TrainingHistory active=\{active\}/)
 assert.match(read('src/components/TrainingWeekArchive.tsx'),/onClick=\{\(\)=>void save\(\)\}/)
})
