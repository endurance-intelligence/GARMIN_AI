import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatVenueSuggestions} from '../supabase/functions/_shared/race-event-archive.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Goals is a configuration workspace, not a duplicate analytics screen',()=>{
 const p=read('src/pages/GoalsPage.tsx')
 assert.doesNotMatch(p,/<GoalProgressCard|<PolarizedMethodCard/)
 assert.match(p,/<ChallengeSetup/)
 assert.match(read('src/components/TrainingDevelopment.tsx'),/<GoalProgressCard/)
 assert.match(read('src/components/CoachLongTermPlan.tsx'),/<section className="cltp-root"/)
})
test('personal challenge uses existing owner-scoped event record, not a fake official source or archive entry',()=>{
 const s=read('supabase/functions/garmin-race-research/index.ts')
 const branch=s.slice(s.indexOf("if(input.action==='save_challenge')"),s.indexOf("if(input.action==='save')"))
 assert.match(branch,/input\.raceName!==goal.race_name/)
 assert.match(branch,/user_id:user.id/)
 assert.match(branch,/eventKind='challenge'/)
 assert.match(branch,/evidence:\[\]/)
 assert.doesNotMatch(branch,/htmlPage\(|garmin_race_event_archive/)
 assert.match(read('src/components/ChallengeSetup.tsx'),/komootEmbedFromTour/)
})
test('selected map suggestion supplies real coordinates to weather, no invented address',()=>{
 const x=formatVenueSuggestions([{properties:{name:'Start',city:'Detmold',osm_type:'N',osm_id:123},geometry:{coordinates:[8.87,51.94]}}],'Detmold')[0]
 assert.equal(x.latitude,51.94);assert.equal(x.longitude,8.87);assert.equal(x.address,null)
 const w=read('src/components/RaceForecastCompact.tsx')
 assert.match(w,/latitude:course!.startLatitude!/)
 assert.match(w,/precise\?\[\]:await findPlaces/)
})
