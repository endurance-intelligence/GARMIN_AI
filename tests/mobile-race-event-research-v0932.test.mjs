import test from 'node:test'
import assert from 'node:assert/strict'
import {safeWebsiteUrl,rankEventPages,parseEventPages} from '../supabase/functions/_shared/race-event-extract.mjs'
import {readFileSync} from 'node:fs'
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const home='https://www.heartbeat-ultra.de/',eventUrl=home+'das-event'
const komoot='https://www.komoot.com/de-de/tour/3288265440?share_token=abc&ref=wtd'
const pages=[
 {url:home,html:[
 '<html><head><title>Heartbeat Ultra | Der Mitmach-Ultra</title></head><body>',
 '<h1>21. November 2026</h1><p>in Fulda</p>',
 '<p>WANN: am 21. November 2026 flexibel ab 06 - 21 Uhr</p>',
 '<p>WAS: BIS zu 112 km langer Spendenrundlauf auf einer ca. 6 km langen Runde</p>',
 '<p>WO: Sportpark Johannisau, Fulda</p>',
 '<a href="/das-event">Strecke und das Event</a>',
 '<a href="/kontakt">Kontakt</a></body></html>'
 ].join('')},
 {url:eventUrl,html:[
 '<html><body><h1>DER SPENDENLAUF IN FULDA</h1>',
 '<section><h3>Start/Ziel</h3><p>Start: AB 06:00 Uhr im Stadion Sportpark Johannisau</p>',
 '<p>Ziel: BIS 21:00 Uhr im Stadion Sportpark Johannisau</p></section>',
 '<h3>Strecke</h3><p>6 km flacher Rundkurs durch Fuldas Auen, größtenteils befestigte Wege.</p>',
 '<p>Hier der Komoot-Link zur Strecke:</p>',
 '<a href="https://www.komoot.com/de-de/tour/3288265440?share_token=abc&amp;ref=wtd">Komoot-Link zur Strecke</a>',
 '</body></html>'
 ].join('')}
]
test('finds event subpage rather than unrelated content',()=>{
 const links=rankEventPages(home,pages[0].html)
 assert.equal(links.length,1)
 assert.equal(links[0].url,eventUrl)
})
test('official HBU facts and Komoot link are extracted with independent field sources',()=>{
 const {details,sources,missing,discoveredPages}=parseEventPages(pages,
  {raceDateHint:'2026-11-21',raceNameHint:'Heartbeat Ultra Fulda'})
 assert.equal(details.eventDate,'2026-11-21')
 assert.equal(details.city,'Fulda')
 assert.equal(details.venue,'Sportpark Johannisau')
 assert.equal(details.startTime,'06:00')
 assert.equal(details.endTime,'21:00')
 assert.equal(details.officialLoopKm,6)
 assert.equal(details.maximumDistanceKm,112)
 assert.equal(details.routeUrl,komoot)
 assert.equal(details.gpxUrl,null)
 assert.ok(!missing.includes('routeUrl'))
 assert.equal(discoveredPages.length,2)
 for(const field of ['venue','eventDate','startTime','officialLoopKm','routeUrl'])
  assert.ok(sources.some(x=>x.field===field&&x.url.startsWith('https://')),field)
})
test('personal goal is NOT rewritten from public route length or max distance',()=>{
 const {details}=parseEventPages(pages,{raceDateHint:'2026-11-21'})
 assert.equal(details.officialLoopKm,6)
 assert.equal(details.maximumDistanceKm,112)
 assert.ok(!Object.hasOwn(details,'distance_km'))
 assert.ok(!Object.hasOwn(details,'target_hours'))
})
test('future structured-event JSON-LD is supported',()=>{
 const sample=['<html><script type="application/ld+json">',
 '{"@context":"https://schema.org","@type":"SportsEvent",',
 '"name":"Traillauf Beispiel 2027","startDate":"2027-05-08T09:30:00+02:00",',
 '"location":{"@type":"Place","name":"Waldstadion",',
 '"address":{"@type":"PostalAddress","streetAddress":"Waldstraße 3",',
 '"postalCode":"36000","addressLocality":"Fulda"}}}',
 '</script></html>'].join('')
 const {details}=parseEventPages([{url:'https://beispiel.de/race',html:sample}],
  {raceDateHint:'2027-05-08'})
 assert.equal(details.eventName,'Traillauf Beispiel 2027')
 assert.equal(details.startTime,'09:30')
 assert.equal(details.eventDate,'2027-05-08')
 assert.equal(details.venue,'Waldstadion')
 assert.equal(details.venueAddress,'Waldstraße 3, 36000, Fulda')
})
test('missing data are empty and explicitly reported; never fabricated',()=>{
 const result=parseEventPages([{url:'https://race.example.org',html:'<h1>Die Anmeldung startet bald</h1>'}])
 assert.equal(result.details.eventDate,null)
 assert.equal(result.details.routeUrl,null)
 assert.equal(result.details.venue,null)
 assert.ok(result.missing.includes('eventDate'))
 assert.ok(result.missing.includes('venue'))
})
test('website discovery rejects localhost, IP targets, redirects to private hosts and non-HTTPS',()=>{
 for(const url of ['http://example.org','https://127.0.0.1','https://10.0.0.1',
   'https://localhost','https://169.254.169.254','https://example.org:8443/',
   'https://user:pw@example.org/','file:///etc/passwd','https://host.internal']){
  assert.throws(()=>safeWebsiteUrl(url),url)
 }
 assert.equal(safeWebsiteUrl('https://www.heartbeat-ultra.de/#foo'),home)
})
test('scanner never silently publishes any data; user explicitly confirms a save',()=>{
 const code=file('supabase/functions/garmin-race-research/index.ts')
 const ui=file('src/components/RaceEventResearch.tsx')
 const sql=file('supabase/migrations/20261111124000_race_event_research_v0932.sql')
 assert.match(code,/action==='scan'/)
 assert.match(code,/action==='save'/)
 assert.match(code,/input.confirm!==true/)
 assert.match(code,/auth\.auth\.getUser/)
 assert.match(code,/user.email_confirmed_at/)
 assert.match(code,/redirect:'manual'/)
 assert.match(code,/total>750000/)
 assert.match(code,/slice\(0,3\)/)
 assert.match(code,/trainingGoalChanged:false,garminChanged:false,intervalsChanged:false/)
 assert.match(ui,/Website analysieren/)
 assert.match(ui,/Diese Angaben und Quellen speichern/)
 assert.match(ui,/Quelle öffnen/)
 assert.match(ui,/Manuell bearbeitet/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/unique \(user_id,race_date,event_url\)/)
})
test('Race Prep entry point and mobile styling exist',()=>{
 const race=file('src/pages/RacePage.tsx')
 const style=file('src/styles/race-event-research.css')
 assert.match(race,/<RaceEventResearch active=\{active\} refreshKey=\{researchRefresh\} onLogoChange=\{setEventLogo\}\/>/)
 assert.match(style,/@media\(max-width:640px\)/)
})
