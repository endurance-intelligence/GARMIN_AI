import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('production app remains owner-gated and adds calendar as a real main tab',()=>{
 const app=read('src/App.tsx')
 assert.match(app,/<OnlineAccessGate>/)
 assert.match(app,/<CalendarPage active=\{page==='calendar'\}/)
 assert.match(app,/<MorePage active=\{page==='more'\}/)
 assert.match(app,/id:'calendar',name:'Kalender'/)
 assert.match(app,/id:'more',name:'Mehr'/)
 assert.match(app,/id==='more'&&\(page==='gear'\|\|page==='settings'\)/)
 const nav=read('src/navigation.ts')
 for(const name of ['calendar','more','gear','settings'])assert.ok(nav.includes("'"+name+"'"))
})

test('calendar reads only verified owner APIs with publishable keys',()=>{
 const cal=read('src/pages/CalendarPage.tsx')
 assert.match(cal,/garmin-connect-snapshot/)
 assert.match(cal,/garmin-training-plan/)
 assert.match(cal,/client.auth.getSession\(\)/)
 assert.match(cal,/session.access_token/)
 assert.match(cal,/apikey:garminPublishableKey/)
 assert.match(cal,/Promise.allSettled/)
 assert.doesNotMatch(cal,/GARMIN_API_KEY|service_role|SUPABASE_SECRET|refreshTokens|scheduleWorkout\(|uploadWorkout\(/)
})

test('calendar distinguishes Garmin entries, drafts, pending and errors',()=>{
 const cal=read('src/pages/CalendarPage.tsx')
 for(const label of ['Aus Garmin übernommen','Entwurf · nicht übertragen',
  'Freigegeben · Garmin ausstehend','Prüfung erforderlich','Mit Garmin bestätigt']){
  assert.ok(cal.includes(label),label)
 }
 assert.match(cal,/Noch kein bestätigter Garmin-Abruf/)
 assert.match(cal,/Ein Entwurf ist kein Garmin-Termin/)
})

test('iPhone week selection fits seven days and iPad two columns without overflow',()=>{
 const css=read('src/styles/horizon-calendar.css')
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/)
 assert.match(css,/@media\(max-width:760px\)/)
 assert.match(css,/@media\(max-width:365px\)/)
 assert.match(css,/\.hc-source-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(css,/\.hc-weekpanel\{[^}]*min-width:0/s)
})

test('More keeps both Equipment and Settings reachable',()=>{
 const more=read('src/pages/MorePage.tsx')
 assert.match(more,/onGo\('gear'\)/)
 assert.match(more,/onGo\('settings'\)/)
 const app=read('src/App.tsx')
 assert.match(app,/<GearPage active=\{page==='gear'\}/)
 assert.match(app,/<SettingsPage active=\{page==='settings'\}/)
})

test('calendar release does not change core weight entry or authentication',()=>{
 const app=read('src/App.tsx')
 assert.match(app,/<OnlineAccessGate>/)
 const coach=read('src/pages/CoachPage.tsx')
 assert.match(coach,/<SyncCenter active=\{active\} mode="weight"\/>/)
 const sync=read('src/components/SyncCenter.tsx')
 assert.match(sync,/session,'POST',\{date,kg\}/)
})
