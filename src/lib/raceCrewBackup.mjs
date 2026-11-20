/**
 * A read-only, plain-text crew backup of the athlete's SAVED race plan.
 * Designed to be copied before race day and work without opening the app.
 * No GPS, actual intake, localStorage, network, or inventory mutation.
 */
import {clockAt} from './gelTiming.mjs'

const safeText=(value,max=160)=>typeof value==='string'?
 value.replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):''
const validMinute=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=2880
const asCount=(n)=>Number.isFinite(n)?Math.round(n*10)/10:0
const at=(startTime,elapsed)=>{
 const clock=clockAt(startTime,elapsed)
 const hours=Math.floor(elapsed/60)
 const mins=Math.round(elapsed%60)
 return (clock?clock+' Uhr':'+'+hours+'h '+String(mins).padStart(2,'0')+'m')
}

export function buildRaceCrewBackup({raceName='',raceDate='',startTime='',
 roadmap=null,eventMenu=null,gelScheduleReady=false,
 aidScheduleReady=false,planSaved=false}={}){
 const rounds=roadmap?.rounds
 if(!Array.isArray(rounds)||!rounds.length||rounds.length>100||
  rounds.some((r,i)=>!r||r.round!==i+1||
   !validMinute(r.arrivalMinutes)||!validMinute(r.pauseMinutes)||
   typeof r.finish!=='boolean'))
  return {status:'missing',text:'',roundCount:0,warnings:['Kein gültiger Rundenplan vorhanden.']}
 const warnings=[]
 if(!planSaved)warnings.push('Verpflegungs-Einstellungen nicht gespeichert: nur VORSCHAU.')
 if(!gelScheduleReady)warnings.push('Gel-Plan nicht vollständig geladen.')
 if(!aidScheduleReady)warnings.push('Verpflegungsplan an der Station nicht bestätigt oder nicht geladen.')
 if(rounds.every(r=>r.gelCount===0))warnings.push('Kein Gel im aktuellen Plan eingeplant.')
 const isComplete=planSaved&&gelScheduleReady&&aidScheduleReady
 const lines=[
  safeText(raceName,100).toUpperCase()+' | CREW-SPICKZETTEL',
  'Datum: '+safeText(raceDate,16)+' · '+rounds.length+' Runden'+
   (startTime&&clockAt(startTime,0)?' · Start '+clockAt(startTime,0)+' Uhr':' · Startzeit nicht bestätigt'),
  isComplete?'STATUS: Aus den gespeicherten Einstellungen erzeugte Planübersicht.':
   'STATUS: UNVOLLSTÄNDIGE VORSCHAU – vor Verwendung Plan prüfen.',
  'NUR PLANUNG. Keine Nahrung oder Getränke als tatsächlich aufgenommen bestätigt.',
  ''
 ]
 for(const r of rounds){
  const finish=r.finish===true
  const time=at(startTime,r.arrivalMinutes)
  const stop=finish?'ZIEL – keine weitere Versorgungsstation angenommen':
   (r.breakType==='long'?'LANGE PAUSE':'Kurze Pause')+
    ' '+asCount(r.pauseMinutes)+' Min. · Weiter '+at(startTime,r.arrivalMinutes+r.pauseMinutes)
  lines.push('RUNDE '+String(r.round).padStart(2,'0')+'/'+rounds.length+
   ' · Ankunft '+time+' · '+stop)
  const gelNames=Array.isArray(r.gelNames)?
   r.gelNames.filter(x=>safeText(x)).map(x=>safeText(x,100)):[]
  if(gelNames.length)lines.push('  Gel laut Plan: '+gelNames.join(' | '))
  else if(gelScheduleReady)lines.push('  Gel laut Plan: keines in dieser Runde')
  else lines.push('  Gel laut Plan: noch nicht geladen')
  if(!finish){
   const food=r.primaryKind==='food'?safeText(r.primary):safeText(r.alternative)
   if(food){
    const hasCarbs=Number(r.foodCarbsG)>0
    lines.push('  Essen an Station: '+food+
     (hasCarbs?' (Portions-KH im Plan; Verzehr nicht bestätigt)':
      ' (Vorschlag, Portions-KH NICHT angerechnet)'))
   }
   if(safeText(r.drink))lines.push('  Getränk: '+safeText(r.drink)+
    ' (Planmenge, nicht Ist-Trinkmenge)')
   if(r.breakType==='long')
    lines.push('  Crew: Schuhe/Kleidung prüfen; feste Nahrung nur nach Verträglichkeit.')
  }
  if(Number(r.caffeineMg)>0)
   lines.push('  Koffein-Gel laut Plan: '+asCount(r.caffeineMg)+
    ' mg · nur wenn das geplante Gel tatsächlich genommen wird.')
  if(r.targetCarbsG!==null&&r.targetCarbsG!==undefined&&
    isComplete&&Number.isFinite(r.plannedTotalCarbsG))
   lines.push('  KH-Richtwert: '+asCount(r.targetCarbsG)+' g · '+
    'im Plan: '+asCount(r.plannedTotalCarbsG)+
    ' g (inkl. eigene Drinks, ohne unbekannte Essensportionen)')
 }
 lines.push('')
 if(eventMenu?.carbDrinkStrength==='160')
  lines.push('STRECKENANGEBOT: MAURTEN Drink Mix 160 aus großem Behälter verfügbar. '+
   'Bei Standardmischung 40 g KH je 500 ml. Keine feste Ausgabemenge; nicht unbegrenzt trinken.')
 if(warnings.length){
  lines.push('NOCH ZU PRÜFEN:')
  for(const warning of warnings)lines.push('  - '+warning)
 }
 lines.push('WICHTIG: Uhrzeiten nur Sollwerte. Keine Live-Position, keine GPS-Kilometer, '+
  'kein erfasster Verzehr. Bei Abweichungen keine Portionen hektisch nachholen.')
 return {status:isComplete?'ready':'partial',
  text:lines.join('\n'),roundCount:rounds.length,warnings}
}
