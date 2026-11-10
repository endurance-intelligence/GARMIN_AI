/** Free local photo text interpretation.
 * OCR is deliberately not "image understanding": preserve unknown values as
 * null for owner review. Never mark a session reviewed or write to Garmin.
 */
import {blankTrainerWorkout,parsePace} from './workoutLibrary.ts'
import type {TrainerGroup,TrainerStep,TrainerWorkout} from './workoutLibrary.ts'

export type PhotoTextDraft={
 workout:TrainerWorkout|null;warnings:string[];
 recognizedText:string;detectedGroups:number
}
const GROUP_NAMES=[
 {pattern:/\bFUCHS\b/i,name:'Fuchs'},
 {pattern:/\bWOLF\b/i,name:'Wolf'},
 {pattern:/\bTIGER\b/i,name:'Tiger'},
 {pattern:/\bB[ÄA]REN\b/i,name:'Bären'},
 {pattern:/\bCAPYBARA\b/i,name:'Capybara'}
]
const REPS=/\b(\d{1,2})\s*[x×]\s*(\d{2,5})\s*m\b/i
const BLOCKS=/\b\d{1,2}(?:\s*\+\s*\d{1,2}){1,7}\b/
const PACE=/\b(?:[2-9]|1[0-4]):[0-5]\d\b/g
const MAX_STEPS=160

function getPaces(source:string){
 return [...source.matchAll(PACE)].map(m=>parsePace(m[0]))
  .filter((n):n is number=>n!==null&&n>=180)
}
function findWarmup(text:string):number|null{
 const match=text.match(/(?:einlaufen|warm\s*up|warmup)[\s\S]{0,90}?(\d+(?:[.,]\d+)?)\s*km\b/i)
 if(!match)return null
 const m=Math.round(Number(match[1].replace(',','.'))*1000)
 return m>=20&&m<=50000?m:null
}
function makeSteps(count:number,meters:number,paceValues:(number|null)[],note:string){
 const steps:TrainerStep[]=[]
 for(let i=0;i<count;i++){
  steps.push({
   kind:'run',distanceMeters:meters,durationSeconds:null,
   paceSecondsPerKm:paceValues[i]??null,notes:note
  })
  if(i<count-1)steps.push({
   kind:'recovery',distanceMeters:null,durationSeconds:null,
   paceSecondsPerKm:null,notes:'Trabpause: Distanz/Dauer aus der Grafik prüfen'
  })
 }
 return steps
}
function findRecoveryMeters(section:string,full:string){
 const backward=/(?:trab|pause|recovery|serie)[^\n]{0,25}?(\d{2,4})\s*m/i
 const forward=/(\d{2,4})\s*m[^\n]{0,24}?(?:trab|pause|recovery|serie)/i
 const value=section.match(backward)?.[1]||section.match(forward)?.[1]||
  full.match(backward)?.[1]||full.match(forward)?.[1]
 const meters=Number(value||0)
 return meters>=20&&meters<=5000?meters:null
}
/** Extract text and known facts. Do not interpolate missing training prescriptions. */
export function interpretLocalPhotoText(text:string):PhotoTextDraft {
 const recognizedText=text.replace(/\r/g,'').trim().slice(0,14000)
 const warnings:string[]=[]
 if(recognizedText.length<12)return {
  workout:null,warnings:['Es wurde zu wenig lesbarer Text gefunden. Ein deutlicheres Foto verwenden.'],
  recognizedText,detectedGroups:0
 }
 const lines=recognizedText.split('\n').map(x=>x.trim()).filter(Boolean)
 const grouped:{name:string;section:string}[]=[]
 let current:{name:string;lines:string[]}|null=null
 for(const line of lines){
  const matched=GROUP_NAMES.find(g=>g.pattern.test(line))
  if(matched){
   if(current)grouped.push({name:current.name,section:current.lines.join('\n')})
   current={name:matched.name,lines:[line]}
  }else if(current)current.lines.push(line)
 }
 if(current)grouped.push({name:current.name,section:current.lines.join('\n')})
 const candidates=grouped.length?grouped:[{name:'Gruppe prüfen',section:recognizedText}]
 const result=blankTrainerWorkout()
 result.title=lines.find(x=>/schwelle im wechsel/i.test(x))||
  'Trainingsgrafik – Titel prüfen'
 result.trainer=/oerlinghausen|örlinghausen|runcrew|\borc\b/i.test(recognizedText)?
  'ORC Runcrew':''
 result.sourceLabel='Trainer-Foto · lokale Texterkennung'
 const warmup=findWarmup(recognizedText)
 result.warmup.distanceMeters=warmup
 result.warmup.notes='Originalgrafik prüfen: Einlaufen und Übungen'
 result.cooldown.notes='Originalgrafik prüfen: Auslaufen'
 const groups:TrainerGroup[]=[]
 for(const candidate of candidates){
  const match=candidate.section.match(REPS)
  if(!match)continue
  const count=Number(match[1]),meters=Number(match[2])
  if(count<1||count>50||meters<50||meters>10000||2*count-1>MAX_STEPS)continue
  const blocks=candidate.section.match(BLOCKS)?.[0]||''
  const blockSizes=blocks?blocks.split('+').map(n=>Number(n.trim())):[]
  const hasExplicitBlock=blockSizes.length>1&&
    blockSizes.every(n=>n>=1&&n<=20)&&blockSizes.reduce((a,b)=>a+b,0)===count
  const paces=getPaces(candidate.section)
  // Repeat a 3-pace cycle ONLY if 3+... block structure is explicit.
  // Everything else remains unknown or directly observed.
  const canCycle=hasExplicitBlock&&blockSizes.every(n=>n<=3)&&paces.length>=3
  const values=Array.from({length:count},(_,i)=>{
   if(paces.length>=count)return paces[i]
   if(canCycle)return paces[i%3]
   return paces[i]??null
  })
  if(values.some(v=>v===null))warnings.push(
   candidate.name+': Nicht alle Tempi lesbar. Fehlende Paces im Editor eintragen.')
  if(canCycle&&paces.length<count)warnings.push(
   candidate.name+': Pace-Wiederholung anhand der Blockfolge vermutet – unbedingt prüfen.')
  const steps=makeSteps(count,meters,values,'Aus Trainer-Grafik; Pace vor Archivierung prüfen')
  const recovery=findRecoveryMeters(candidate.section,recognizedText)
  for(const step of steps)if(step.kind==='recovery'){
   step.distanceMeters=recovery
   step.notes=recovery===null?'Trabpause: Distanz/Dauer prüfen':
    'Trabpause '+recovery+' m – Serienpausen prüfen'
  }
  if(recovery===null)warnings.push(
   candidate.name+': Trabpausen nicht eindeutig erkannt.')
  groups.push({name:candidate.name,
   notes:hasExplicitBlock?'Blöcke laut Text: '+blockSizes.join(' + '):
    'Blockfolge nicht sicher erkannt. Originalbild prüfen.',
   steps})
 }
 if(groups.length===0)return {
  workout:null,recognizedText,detectedGroups:0,
  warnings:['Die Schrift wurde gelesen, aber Gruppen/Intervalle sind nicht eindeutig. Im Editor manuell anhand des Originalbilds ergänzen.']
 }
 result.groups=groups.slice(0,12)
 warnings.unshift('Lokale OCR ist keine vollständige Bild-KI. Jede Gruppe, Pace und Pause vor dem Archivieren mit der Grafik vergleichen.')
 if(groups.length===1&&GROUP_NAMES.length>1&&
   GROUP_NAMES.some(g=>g.pattern.test(recognizedText)&&g.name!==groups[0].name))
   warnings.push('Mindestens eine weitere Gruppe ist im Text vorhanden, aber nicht vollständig erkannt.')
 return {workout:result,recognizedText,detectedGroups:groups.length,warnings}
}
