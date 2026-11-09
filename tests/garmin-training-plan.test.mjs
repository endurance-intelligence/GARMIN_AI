import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261109145500_garmin_training_plan_queue.sql')
const api=read('supabase/functions/garmin-training-plan/index.ts')

test('training outbox denies public and normal user table access',()=>{
 assert.match(sql,/garmin_training_plan enable row level security/i)
 assert.match(sql,/revoke all on table public.garmin_training_plan from public,anon,authenticated/i)
 assert.match(sql,/grant select,insert,update on table public.garmin_training_plan to service_role/i)
})

test('drafts must be explicitly approved before attempting Garmin sync',()=>{
 assert.match(sql,/default 'draft'/)
 assert.match(api,/state:'draft'/)
 assert.match(api,/input.action==='approve'/)
 assert.match(api,/query=query.eq\('state','draft'\)/)
 assert.match(api,/state:'pending'/)
 assert.match(api,/garminWritesActive:false/)
})

test('owner-only authentication checks verified Supabase JWT and confirmed owner email',()=>{
 assert.match(api,/auth.auth.getUser\(match\[1\]\)/)
 assert.match(api,/user.email_confirmed_at/)
 assert.match(api,/user.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(api,/Origin forbidden/)
})

test('create is idempotent with immutable client request ID',()=>{
 assert.match(sql,/client_request_id uuid not null unique/)
 assert.match(api,/client_request_id:input.clientRequestId/)
 assert.match(api,/if\(!same\)return response\(409/)
 assert.match(api,/saved:true,created:false/)
})

test('no public action sends Garmin changes or handles Garmin OAuth credentials',()=>{
 assert.doesNotMatch(api,/getTokens|refreshTokens|scheduleWorkout\(|createCalendarEvent\(|uploadWorkout\(/)
 assert.match(api,/garminUpdated:false/)
 assert.match(sql,/garmin_remote_id/)
})

test('confirmed remote entries cannot be silently canceled locally',()=>{
 assert.match(api,/query=query.in\('state',\['draft','pending','needs_review'\]\)/)
 assert.match(sql,/garmin_plan_confirmation_consistency/)
})
