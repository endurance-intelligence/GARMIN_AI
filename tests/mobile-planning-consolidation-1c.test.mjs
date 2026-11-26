import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('browser and cron share one full evidence reader and independent auth gates',()=>{
 const edge=read('supabase/functions/garmin-coach-archive/index.ts'),reader=read('supabase/functions/_shared/coach-archive-reader.ts'),client=read('src/lib/coachSnapshot.ts')
 assert.match(edge,/auth.auth.getUser\(bearer\[1\]\)/)
 assert.ok(edge.indexOf('if(!user.email_confirmed_at')<edge.indexOf('const data=await readArchiveCoachInput(db,user.id,today,visible)'))
 assert.match(edge,/load:\(today:string\)=>readArchiveCoachInput\(db,userId,today\)/)
 assert.match(edge,/if\(req.method!=='POST'\|\|req.headers.has\('origin'\)\)/)
 assert.match(edge,/if\(allowed!==true\)/)
 assert.match(client,/await loadTrainingRhythm\(signal\)/)
 assert.match(client,/garmin-coach-archive\?week=/)
 assert.doesNotMatch(client,/get\('garmin-week-board|get\('read-garmin-health|Promise.all/)
 assert.match(reader,/length:4/)
 assert.match(reader,/visibleWeek\|\|first/)
 assert.match(reader,/if\(training.truncated\)throw/)
 assert.match(client,/data.today!==today/)
})
