import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatVenueSuggestions,archiveCanonicalUrl,archiveForNewEdition} from '../supabase/functions/_shared/race-event-archive.mjs'
import {discoverEventLogo} from '../supabase/functions/_shared/race-event-extract.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const venue=(p={})=>({properties:{name:'Sportpark Johannisau',city:'Fulda',
 street:'Johannisstraße',housenumber:'45',postcode:'36041',osm_type:'W',osm_id:123,...p},
 geometry:{coordinates:[9.68,50.53]}})
test('autocomplete returns a complete selectable address, only required fields',()=>{
 const results=formatVenueSuggestions([venue()])
 assert.equal(results.length,1)
 assert.deepEqual(results[0],{
  name:'Sportpark Johannisau',city:'Fulda',
  address:'Johannisstraße 45, 36041 Fulda',
  subtitle:'Johannisstraße 45 36041 Fulda',
  source:'https://www.openstreetmap.org/way/123',
  hasFullAddress:true
 })
})
test('suggestions do not fabricate a missing house number',()=>{
 const [v]=formatVenueSuggestions([venue({housenumber:null})])
 assert.equal(v.address,null)
 assert.equal(v.hasFullAddress,false)
})
test('same event across two years retains previous edition data',()=>{
 const original={
  eventName:'Heartbeat Ultra',eventDate:'2026-11-21',startTime:'06:00',
  officialLoopKm:6,venue:'Sportpark Johannisau',routeUrl:'https://www.komoot.com/de-de/tour/3288265440'
 }
 const next=archiveForNewEdition(original,'2027-11-20')
 assert.equal(next.eventDate,'2027-11-20')
 assert.equal(next.routeUrl,original.routeUrl)
 assert.equal(original.eventDate,'2026-11-21')
 next.routeUrl='https://www.komoot.com/de-de/tour/99999'
 assert.equal(original.routeUrl,'https://www.komoot.com/de-de/tour/3288265440')
 assert.equal(archiveCanonicalUrl('https://www.heartbeat-ultra.de/?utm_source=x#jump'),
  'https://www.heartbeat-ultra.de/')
})
test('official publisher logo beats a generic favicon and never invents an asset',()=>{
 const parsed=discoverEventLogo([{url:'https://www.heartbeat-ultra.de/',html:[
  '<link rel="icon" href="/favicon.ico">',
  '<img alt="Veranstaltungslogo" data-src="https://images.squarespace-cdn.com/content/example/RZ_HBU_Logo_0425.png">',
  '<img src="/sponsor-logo.png" alt="Logo von einem Sponsor">'
 ].join('')}])
 assert.equal(parsed.kind,'site_logo')
 assert.match(parsed.url,/RZ_HBU_Logo_0425\.png/)
 assert.equal(parsed.source,'https://www.heartbeat-ultra.de/')
 assert.equal(discoverEventLogo([{url:'https://event.de/',html:'<p>Kein Bild</p>'}]),null)
})
test('server keeps archives separate from annual snapshots, no training writes',()=>{
 const api=read('supabase/functions/garmin-race-research/index.ts')
 const sql=read('supabase/migrations/20261111150000_race_event_archive_v0934.sql')
 assert.match(sql,/garmin_race_event_archive/)
 assert.match(sql,/unique\(user_id, canonical_url\)/)
 assert.match(sql,/enable row level security/)
 assert.match(api,/\.from\('garmin_race_event_research'\)/)
 assert.match(api,/\.from\('garmin_race_event_archive'\)/)
 assert.match(api,/archiveCanonicalUrl\(eventUrl\)/)
 assert.match(api,/template=\{\.\.\.details,eventDate:null\}/)
 assert.match(api,/input\.confirm!==true/)
 assert.match(api,/trainingGoalChanged:false,garminChanged:false,intervalsChanged:false/)
})
test('venue autocomplete is on-demand, owner-authorized and rate-limited',()=>{
 const api=read('supabase/functions/garmin-race-research/index.ts')
 const ui=read('src/components/VenueAutocomplete.tsx')
 assert.match(api,/input\.action==='suggest_venues'/)
 assert.match(api,/query\.length<4/)
 assert.match(api,/1100/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(api,/garmin_race_venue_geocode_cache/)
 assert.match(ui,/setTimeout\(\(\)=>/)
 assert.match(ui,/\},750\)/)
 assert.match(ui,/onClick=\{\(\)=>select\(item\)\}/)
 assert.match(ui,/Ab 4 Zeichen erscheinen Vorschläge/)
})
test('visible archive lets user reuse old route or edit it for new edition',()=>{
 const ui=read('src/components/RaceEventResearch.tsx')
 const goal=read('src/components/CoachGoalPanel.tsx')
 const race=read('src/pages/RacePage.tsx')
 assert.match(ui,/useArchived\(item\)/)
 assert.match(ui,/eventDate:goal\.raceDate/)
 assert.match(ui,/Strecke für diese Austragung ändern/)
 assert.match(ui,/Für aktuelles Ziel übernehmen/)
 assert.match(ui,/Diese Angaben und Quellen speichern/)
 assert.match(goal,/logoUrl\?:string\|null/)
 assert.match(race,/onLogoChange=\{setEventLogo\}/)
})
