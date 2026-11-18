import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {confirmedAbsentOnDate} from '../supabase/functions/_shared/intervals-cleanup-reconcile.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const plan={id:'289df624-84b4-45ae-a46a-4a072da390cc',
 training_date:'2026-11-10',intervals_event_id:154224952}
test('manually deleted Wolf workout: a successfully fetched empty date is confirmed absent',()=>{
 assert.equal(confirmedAbsentOnDate([],plan),true)
 assert.equal(confirmedAbsentOnDate([{id:1,external_id:'other'}],plan),true)
})
test('never falsely clear an existing event when the saved event ID or external_id matches',()=>{
 assert.equal(confirmedAbsentOnDate([{id:154224952}],plan),false)
 assert.equal(confirmedAbsentOnDate([{id:123456789,external_id:'garmin-ai:'+plan.id}],plan),false)
})
test('failed/invalid remote date lookup must never be interpreted as absence',()=>{
 assert.equal(confirmedAbsentOnDate(null,plan),false)
 assert.equal(confirmedAbsentOnDate({},plan),false)
 assert.equal(confirmedAbsentOnDate([], {...plan,intervals_event_id:0}),false)
})
test('remote status checking is explicit and never performs DELETE when event exists',()=>{
 const remote=read('supabase/functions/garmin-intervals/index.ts')
 assert.match(remote,/input\.action==='verify_cleanup'/)
 assert.match(remote,/const verifyOnly=input\.action==='verify_cleanup'/)
 assert.match(remote,/else if\(verifyOnly\)/)
 assert.match(remote,/remoteStillPresent=true/)
 assert.match(remote,/if\(verifyOnly&&!remoteRemoved\)/)
 assert.match(remote,/remoteRemoved:false/)
 assert.match(remote,/await fullEvent\(secret,plan\.intervals_event_id\)/)
 assert.match(remote,/e instanceof RemoteError&&e\.status===404/)
 assert.match(remote,/await missingFromCalendar\(secret,plan\)/)
 assert.match(remote,/confirmedAbsentOnDate\(events,plan\)/)
 assert.match(remote,/remoteAlreadyAbsent=true/)
 assert.match(remote,/intervals_sync_status:remoteRemoved\?'not_published':'needs_review'/)
 assert.match(remote,/intervals_event_id:null,intervals_published_revision:null/)
 assert.doesNotMatch(remote,/if\(e instanceof RemoteError&&e\.status===429\)\{\s*remoteRemoved=true/)
})
test('a one-click check clears an already-removed local cleanup flag, otherwise asks before DELETE',()=>{
 const ui=read('src/pages/CalendarPage.tsx')
 assert.match(ui,/async function verifyRemoteCleanup\(plan:Plan\)/)
 assert.match(ui,/action:'verify_cleanup'/)
 assert.match(ui,/onClick=\{\(\)=>void verifyRemoteCleanup\(plan\)\}/)
 assert.match(ui,/Bei Intervals\.icu abgleichen/)
 assert.match(ui,/if\(result\.saved&&result\.remoteRemoved\)/)
 assert.match(ui,/intervals_sync_status:'not_published'/)
 assert.match(ui,/if.*remoteStillPresent\)/)
 assert.match(ui,/setCleanupArmed\(plan\.id\)/)
 assert.match(ui,/action:'cleanup_published'/)
})
