import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runningSportSettings,wellnessTrend,matchOneGarminActivity,activityEvidence,coachIntervalsNote} from '../supabase/functions/garmin-intervals-insights/intervalsInsights.mjs'
const athlete={sportSettings:[{types:['Ride'],hr_zones:[100,120]},{types:['Run','TrailRun'],lthr:171,hr_zones:[110,135,150,166,181],pace_zones:[420,380,340],hr_zone_names:['Easy','Z2','Z3','Z4','Z5']}]}
test('read only running sport settings, not cycling zones or fabricated LT1',()=>{
 const s=runningSportSettings(athlete)
 assert.equal(s.lthr,171)
 assert.deepEqual(s.hrZones,[110,135,150,166,181])
 assert.equal('lt1' in s,false)
 assert.equal(runningSportSettings({sportSettings:[]}),null)
})
test('training load trend only from actual dated wellness, never synthetic defaults',()=>{
 const w=wellnessTrend([{id:'2026-11-09',ctl:42,atl:55},{id:'2026-11-15',ctl:44,atl:49},{id:'2026-11-04',ctl:30,atl:31}], '2026-11-09','2026-11-15')
 assert.deepEqual([w.ctl,w.atl,w.form,w.ctlChange,w.daysBetween],[44,49,-5,2,6])
 assert.equal(wellnessTrend([{id:'2026-11-09',hrv:54}],'2026-11-09','2026-11-15'),null)
})
test('match real intervals activity uniquely by same local start and distance',()=>{
 const garmin={start_time_local:'2026-11-14 09:06:54',distance_m:13200}
 const remote=[{id:'i1',type:'Run',start_date_local:'2026-11-14T09:08:00',distance:13205,icu_training_load:85},
  {id:'ride',type:'Ride',start_date_local:'2026-11-14T09:06:00',distance:13200}]
 assert.equal(matchOneGarminActivity(garmin,remote)?.id,'i1')
 assert.equal(matchOneGarminActivity(garmin,[...remote,{...remote[0],id:'i2'}]),null)
 assert.equal(matchOneGarminActivity(garmin,[{...remote[0],distance:11000}]),null)
 assert.equal(matchOneGarminActivity({start_time_local:'2026-11-14 09:06:54',distance_m:null},remote),null)
})
test('do not double count, infer subjective verdict or invent missing load',()=>{
 const e=activityEvidence({icu_training_load:89,icu_intensity:.8,source:'GARMIN_CONNECT'},null)
 assert.equal(e.load,89)
 assert.match(coachIntervalsNote({connected:true,activity:e},'training'),/nicht doppelt gezählt/)
 assert.equal(activityEvidence({},{}).load,null)
 assert.equal(coachIntervalsNote({connected:false},'weekly'),null)
})

import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Intervals context is strictly owner-only read-only, remote GET only',()=>{
 const src=read('supabase/functions/garmin-intervals-insights/index.ts')
 assert.match(src,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(src,/user\.email_confirmed_at/)
 assert.match(src,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(src,/req\.method!=='GET'/)
 assert.match(src,/method:'GET',cache:'no-store',redirect:'error'/)
 assert.match(src,/\.rpc\('garmin_intervals_key_get',\{p_user_id:user\.id\}\)/)
 assert.match(src,/\.eq\('user_id',user\.id\)/)
 assert.doesNotMatch(src,/['"](POST|PUT|DELETE)['"],\s*['"]\/athlete/)
 assert.match(src,/matchOneGarminActivity\(garmin,remoteActivities\)/)
})
test('only supplemental data, Garmin coach still primary and no duplicate counting',()=>{
 const view=read('src/components/IntervalsCoachContext.tsx')
 assert.match(view,/Garmin bewertet den Lauf/)
 assert.match(view,/Die Garmin-Bewertung bleibt gültig/)
 assert.match(read('src/components/SessionVisualInsights.tsx'),/Hinterlegte LTHR/)
 assert.match(view,/garmin-intervals-insights/)
 assert.match(view,/mode==='activity'/)
})

test('actual Garmin coach summaries embed small Intervals context but remain the only verdict',()=>{
 const src=read('src/components/CoachEvidenceSummary.tsx')
 assert.match(src,/mode="week" weekStart=\{start\}/)
 assert.match(src,/mode="activity" activityId=\{r\.activityId\}/)
 assert.equal((src.match(/<IntervalsCoachContext/g)||[]).length,2)
 assert.match(src,/Für die nächste Woche:/)
 assert.match(src,/COACH \/ FAZIT/)
})