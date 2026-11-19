/**
 * Explicit, read-only race-day readiness check.
 * The only temporary write is a disposable probe key, NEVER the race log.
 * Does not test a true browser restart or assert offline authentication.
 */
import {validateRunnerSnapshot} from './raceRunnerSafety.mjs'

const clock=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const check=(id,status,label,detail)=>({id,status,label,detail})
export function runRaceDayPreflight({storage=null,key='',raceDate='',raceName='',
 total=0,expectedCompleted=0,loaded=false,storageReady=false,
 saved=false,startTime='',gelEvents=null,aidEvents=null}={}){
 const checks=[]
 checks.push(loaded&&storageReady?
  check('session','ok','Rennlog geladen','Die Rennansicht hat den lokalen Rennstand geladen.'):
  check('session','blocked','Rennlog nicht bereit',
   'Bitte die Rennansicht neu öffnen und die Anmeldung kontrollieren.'))
 if(!storage||typeof key!=='string'||!key.startsWith('garmin-ai:race-day:v1:')||
   !Number.isInteger(total)||total<1||total>500){
  checks.push(check('storage','blocked','Speicherprüfung nicht möglich',
   'Das Gerät oder der Rennplan ist für den Speichertest nicht bereit.'))
 }else{
  const probe=key+':preflight-probe-'+Date.now().toString(36)+'-'+
   Math.random().toString(36).slice(2)
  const sentinel='garmin-ai:preflight:temporary'
  let wrote=false
  try{
   // Inspect the real race record READ-ONLY before probing disposable space.
   const raw=storage.getItem(key)
   if(raw!==null){
    const stored=JSON.parse(raw)
    const valid=validateRunnerSnapshot(stored,{raceDate,raceName,total})
    if(!valid.ok)throw Error('Rennstand ungültig: '+(valid.reason||'unbekannt'))
    if(valid.completed!==expectedCompleted)
     throw Error('Gespeicherter Rundenzähler stimmt nicht mit der Ansicht überein.')
   }else if(expectedCompleted>0){
    throw Error('Die Anzeige enthält Runden, im lokalen Rennspeicher fehlen sie.')
   }
   storage.setItem(probe,sentinel)
   wrote=true
   if(storage.getItem(probe)!==sentinel)
    throw Error('Testeintrag konnte nicht zurückgelesen werden.')
   checks.push(check('storage','ok','Lokaler Speicher geprüft',
    'Schreiben und Rücklesen erfolgreich; der Rennstand wurde nicht verändert.'))
  }catch(e){
   checks.push(check('storage','blocked','Lokaler Speicher fehlerhaft',
    e instanceof Error?e.message:'Speicher kann nicht gelesen oder geschrieben werden.'))
  }finally{
   if(wrote){
    try{storage.removeItem(probe)}catch{/* disposable test key only */}
   }
  }
 }
 checks.push(saved?
  check('plan','ok','Rennstrategie gespeichert','Der Wettkampfplan ist als gespeichert markiert.'):
  check('plan','review','Rennstrategie noch nicht gespeichert',
   'Rennplan und Pausenzeiten vor Samstag speichern.'))
 checks.push(clock(startTime)?
  check('start','ok','Startuhrzeit hinterlegt',startTime+' Uhr ist für die Rennansicht eingestellt.'):
  check('start','review','Startuhrzeit fehlt',
   'Vor dem Start im Crew-Bereich die Uhrzeit bestätigen; sonst keine automatische Zeit seit Start.'))
 checks.push(Array.isArray(gelEvents)?
  check('gel','ok','Gel Buddy geladen',gelEvents.length?
   gelEvents.length+' Gel-Portion(en) im Plan hinterlegt. Nur Planung.':
   'Kein Gel eingeplant; prüfen, ob Essen und Getränke die Versorgung abdecken.'):
  check('gel','review','Gel Buddy noch nicht verfügbar',
   'Gel Buddy öffnen und den gespeicherten Verpflegungsplan prüfen.'))
 checks.push(Array.isArray(aidEvents)&&aidEvents.length?
  check('aid','ok','Streckenverpflegung eingeplant',
   aidEvents.length+' Versorgungstermin(e) im Plan; tatsächliche Verfügbarkeit vor Ort prüfen.'):
  check('aid','review','Streckenverpflegung nicht bestätigt',
   'Maurten Drink Mix und Lebensmittel erst nach bestätigter Variante/Portion anrechnen.'))
 const blocked=checks.filter(x=>x.status==='blocked').length
 const review=checks.filter(x=>x.status==='review').length
 return {status:blocked?'blocked':review?'review':'ready',checks,blocked,review,
  raceLogUntouched:true,
  caveat:'Der Test prüft nur den Browser auf diesem Gerät. Er beweist weder einen Neustart ohne Internet noch die Genauigkeit der Geräteuhr.'}
}
