import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {venueAddressMatch,photonLookupURL} from '../supabase/functions/_shared/race-venue-geocode.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sportpark={type:'Feature',properties:{
 name:'Sportpark Johannisau',city:'Fulda',street:'Johannisstraße',
 housenumber:'45',postcode:'36041',osm_type:'W',osm_id:123456
},geometry:{coordinates:[9.684,50.54]}}
const other={type:'Feature',properties:{
 name:'Sportpark Johannisau',city:'Kassel',street:'Wilhelmshöher Allee',
 housenumber:'45',postcode:'34121',osm_type:'W',osm_id:22
},geometry:{coordinates:[9.44,51.31]}}
test('Sportpark Johannisau + Fulda resolves complete venue address with source',()=>{
 const result=venueAddressMatch('Sportpark Johannisau','Fulda',[other,sportpark])
 assert.equal(result.address,'Johannisstraße 45, 36041 Fulda')
 assert.equal(result.matchedVenue,'Sportpark Johannisau')
 assert.equal(result.confidence,'high')
 assert.equal(result.source,'https://www.openstreetmap.org/way/123456')
})
test('new race event venue is handled generically, no Fulda-specific fallback',()=>{
 const result=venueAddressMatch('Waldstadion Bad Hersfeld','Bad Hersfeld',[{properties:{
  name:'Waldstadion Bad Hersfeld',city:'Bad Hersfeld',street:'Am Stadion',
  housenumber:'1',postcode:'36251'},geometry:{coordinates:[9.7,50.9]}}])
 assert.equal(result.address,'Am Stadion 1, 36251 Bad Hersfeld')
})
test('do not invent street or house number for just a matched stadium or city',()=>{
 for(const edit of [
  {housenumber:''},{street:''},{postcode:''},{city:'Berlin'},
  {name:'Anderer Sportpark'},{name:''}
 ]){
  const copy={...sportpark,properties:{...sportpark.properties,...edit}}
  assert.equal(venueAddressMatch('Sportpark Johannisau','Fulda',[copy]),null,
   JSON.stringify(edit))
 }
})
test('ambiguous addresses under the same venue name are not auto-filled',()=>{
 const second={...sportpark,properties:{...sportpark.properties,housenumber:'47',osm_id:33}}
 assert.equal(venueAddressMatch('Sportpark Johannisau','Fulda',[sportpark,second]),null)
})
test('one narrow single venue lookup is constructed, no autocomplete or bulk',()=>{
 const url=new URL(photonLookupURL('Sportpark Johannisau','Fulda'))
 assert.equal(url.origin,'https://photon.komoot.io')
 assert.equal(url.pathname,'/api/')
 assert.equal(url.searchParams.get('q'),'Sportpark Johannisau, Fulda')
 assert.equal(url.searchParams.get('lang'),'de')
 assert.equal(url.searchParams.get('limit'),'8')
})
test('scanner only geocodes when address missing and caches result',()=>{
 const code=read('supabase/functions/garmin-race-research/index.ts')
 assert.match(code,/if\(!result\.details\.venueAddress&&result\.details\.venue\)/)
 assert.match(code,/result\.details\.city\|\|goal\.race_location/)
 assert.match(code,/resolveVenueAddress\(db,user\.id/)
 assert.match(code,/garmin_race_venue_geocode_cache/)
 assert.match(code,/30\*86400000/)
 assert.match(code,/if\(geo\.match\)/)
 assert.match(code,/field:'venueAddress',url:geo\.match\.source/)
 assert.match(code,/addressResolution/)
 assert.match(code,/redirect:'error'/)
 assert.match(code,/!response\.ok/)
 assert.doesNotMatch(code,/nominatim\.openstreetmap\.org/)
})
test('address UI shows external provenance, still requires explicit user save',()=>{
 const ui=read('src/components/RaceEventResearch.tsx')
 const sql=read('supabase/migrations/20261111131500_race_venue_geocode_cache.sql')
 assert.match(ui,/Automatisch anhand von Veranstaltungsort und Stadt gefunden/)
 assert.match(ui,/www\.openstreetmap\.org\/copyright/)
 assert.match(ui,/Diese Angaben und Quellen speichern/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/primary key \(user_id,query_key\)/)
})
