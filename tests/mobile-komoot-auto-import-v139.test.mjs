import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {komootTourRequest,parseKomootTour} from '../supabase/functions/_shared/komoot-tour-import.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('only Komoot tour URLs accepted; token stays on fixed Komoot host',()=>{
 const x=komootTourRequest('https://www.komoot.com/de-de/tour/12345678?share_token=exampleToken_123&ref=wtd')
 assert.equal(x.id,'12345678')
 assert.equal(new URL(x.url).origin,'https://www.komoot.com')
 assert.equal(new URL(x.url).searchParams.get('share_token'),'exampleToken_123')
 for(const u of ['https://evil.com/tour/12345678','https://komoot.com.evil.com/tour/12345678','http://komoot.com/tour/12345678','https://user@komoot.com/tour/12345678','https://komoot.com:444/tour/12345678','https://komoot.com/tour/abc','https://komoot.com/tour/12345678?share_token=%2F'])assert.equal(komootTourRequest(u),null)
})
test('only actual data from matching tour accepted, missing and invalid values remain null',()=>{
 const m=parseKomootTour({id:12345678,name:'Example',distance:62700,elevation_up:1120,elevation_down:1120,start_point:{lat:51.9,lng:8.8}},'12345678')
 assert.equal(m.ascentM,1120);assert.equal(m.distanceM,62700);assert.equal(m.start.latitude,51.9)
 assert.equal(parseKomootTour({id:999,distance:62700},'12345678'),null)
 const partial=parseKomootTour({id:12345678,distance:62700,elevation_up:null,start_point:{lat:91,lng:8}},'12345678')
 assert.equal(partial.ascentM,null);assert.equal(partial.start,null)
})
test('automatic read-only lookup, stale response guard, optional explicit overwrite, compact header',()=>{
 const ui=read('src/components/ChallengeSetup.tsx'),api=read('supabase/functions/garmin-race-research/index.ts')
 assert.match(ui,/action:'import_komoot'/)
 assert.match(ui,/if\(!alive\)return/)
 assert.match(ui,/d.route!==link\?d:/)
 assert.match(ui,/ascent:d.ascent\|\|/)
 assert.match(ui,/Tourwerte übernehmen/)
 assert.match(ui,/!isChallenge&&!editing/)
 assert.match(ui,/challenge-edit-control/)
 const branch=api.slice(api.indexOf("if(input.action==='import_komoot')"),api.indexOf("if(input.action==='suggest_venues')"))
 assert.match(branch,/redirect:'error'/)
 assert.match(branch,/saved:false/)
 assert.doesNotMatch(branch,/\.upsert\(|\.insert\(|console\.log|\.update\(/)
})
