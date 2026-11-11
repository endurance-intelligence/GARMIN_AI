import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {komootEmbedFromTour} from '../src/lib/komootEmbed.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('public Heartbeat Ultra share link yields supported Komoot map+elevation embed',()=>{
 const tour=komootEmbedFromTour('https://www.komoot.com/de-de/tour/3288265440?share_token=abcDEF123xyz&ref=wtd')
 assert.equal(tour.id,'3288265440')
 assert.equal(tour.canonicalUrl,'https://www.komoot.com/tour/3288265440')
 const embed=new URL(tour.url)
 assert.equal(embed.hostname,'www.komoot.com')
 assert.equal(embed.pathname,'/tour/3288265440/embed')
 assert.equal(embed.searchParams.get('layout'),'classic')
 assert.equal(embed.searchParams.get('profile'),'1')
 assert.equal(embed.searchParams.get('hl'),'de')
 assert.equal(embed.searchParams.get('share_token'),'abcDEF123xyz')
 assert.equal(embed.searchParams.get('ref'),null)
})
test('only real HTTPS Komoot tour URL can become an iframe',()=>{
 for(const x of [
  'https://komoot.com.evil.org/tour/3288265440',
  'javascript:alert(1)',
  'http://www.komoot.com/tour/3288265440',
  'https://www.komoot.com:8888/tour/3288265440',
  'https://someone@www.komoot.com/tour/3288265440',
  'https://www.komoot.com/user/3288265440',
  'https://www.komoot.com/tour/abc',
  'https://www.komoot.com/tour/3288265440/anything'
 ])assert.equal(komootEmbedFromTour(x),null,x)
 assert.equal(komootEmbedFromTour('https://komoot.com/tour/3288265440').id,'3288265440')
})
test('Race Prep places forecast + map + elevation INSIDE saved edition dossier',()=>{
 const race=read('src/pages/RacePage.tsx')
 const scout=read('src/components/RaceEventResearch.tsx')
 assert.match(race,/<RaceEventResearch active=\{active\}/)
 assert.match(race,/<RaceForecastCompact active=\{active\} eventCity=\{eventCity\}/)
 assert.match(race,/<RaceRouteViewer active=\{active\}/)
 assert.match(race,/<\/RaceEventResearch>/)
 assert.match(scout,/children&&<div className="rer-event-dossier">/)
 assert.match(scout,/GESPEICHERTE VERANSTALTUNG|Gespeicherte Veranstaltungsdaten/)
 assert.match(scout,/saved\[0\]\.event_title/)
 assert.match(scout,/saved\[0\]\.race_date/)
})
test('the original Komoot tour embed works without a GPX import',()=>{
 const viewer=read('src/components/RaceRouteViewer.tsx')
 assert.match(viewer,/<iframe title=/)
 assert.match(viewer,/src=\{komoot\.url\}/)
 assert.match(viewer,/profile/)
 assert.match(viewer,/Komoot · Interaktive Karte & Höhenprofil/)
 assert.match(viewer,/Optionale GPX-Analyse für Gegenwindabschnitte/)
 assert.match(viewer,/Für unsere eigene richtungsabhängige Windanalyse/)
 assert.doesNotMatch(viewer,/mcp\.main\.komoot\.net/)
 const styles=read('src/styles/race-route-viewer.css')
 assert.match(styles,/rrv-komoot iframe/)
})
test('changing route link updates the edition + archival template only on confirmation',()=>{
 const scout=read('src/components/RaceEventResearch.tsx')
 const api=read('supabase/functions/garmin-race-research/index.ts')
 assert.match(scout,/Komoot-Link ändern/)
 assert.match(scout,/komootEmbedFromTour\(routeDraft\)/)
 assert.match(scout,/input\.raceDate|raceDate:goal\.raceDate/)
 assert.match(scout,/details:changed,sources:evidence/)
 assert.match(scout,/onEventSaved\?\.\(\)/)
 assert.match(api,/input\.confirm!==true/)
 assert.match(api,/\.from\('garmin_race_event_research'\)/)
 assert.match(api,/\.from\('garmin_race_event_archive'\)/)
 assert.match(scout,/Frühere Austragungen behalten ihre Strecke/)
})
test('race forecast location comes from saved event city, with goal as fallback',()=>{
 const viewer=read('src/components/RaceForecastCompact.tsx')
 const scout=read('src/components/RaceEventResearch.tsx')
 const page=read('src/pages/RacePage.tsx')
 assert.match(viewer,/const location=\(eventCity\|\|goal\?\.race_location\|\|''\)/)
 assert.match(viewer,/\[active,refreshKey,eventCity\]/)
 assert.match(scout,/onEventCityChange\?\.\(/)
 assert.match(page,/onEventCityChange=\{setEventCity\}/)
})
