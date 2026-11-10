/** Read each horizontal group card separately. Never assign a pace to a
 * different group's row. Unknown facts remain editable, not invented. */
import {blankTrainerWorkout,parsePace} from './workoutLibrary.ts'
import type {TrainerWorkout,TrainerGroup,TrainerStep} from './workoutLibrary.ts'
export type SpatialOcrRow={name:string;leftText:string;rightText:string}
export type SpatialOcrResult={text:string;rows:SpatialOcrRow[]}
export type SpatialWorkoutDraft={workout:TrainerWorkout|null;warnings:string[];
 recognizedText:string;detectedGroups:number;incompleteGroups:string[]}
const NORMAL=/\b(\d{1,2})\s*[x×*]\s*(\d{2,5})\s*m\b/i
const SPACED=/\b(\d{1,2})[ \t]+(\d{3,5})\s*m\b/i
const FUSED=/\b([1-9]|[1-4]\d)(1000|400|800|2000)\s*m\b/i
const PACE=/\b(?:[2-9]|1[0-4]):[0-5]\d\b/g
function parseReps(text:string){
 const clean=text.replace(/\r/g,'')
 const normal=clean.match(NORMAL)
 const m=normal||clean.match(SPACED)||clean.match(FUSED)
 if(!m)return null
 const count=Number(m[1]),meters=Number(m[2])
 if(count<1||count>50||meters<50||meters>10000||count*2-1>160)return null
 return {count,meters,uncertain:!normal}
}
function parseBlocks(text:string,count:number){
 const m=text.match(/\b\d{1,2}(?:\s*\+\s*\d{1,2}){1,6}\b/)
 if(!m)return null
 const sizes=m[0].split('+').map(Number)
 return sizes.every(x=>x>0&&x<=30)&&sizes.reduce((a,b)=>a+b,0)===count?
  sizes:null
}
function rowPaces(text:string){
 let best:number[]=[]
 for(const line of text.split('\n')){
  const values=[...line.matchAll(PACE)].map(m=>parsePace(m[0]))
   .filter((n):n is number=>n!==null)
  if(values.length>best.length)best=values
 }
 return best
}
function getRecovery(text:string){
 const m=text.match(/(\d{2,4})\s*m.{0,25}?(?:trab|pause)/i)||
  text.match(/(?:trab|pause).{0,25}?(\d{2,4})\s*m/i)
 const v=Number(m?.[1]||0)
 return v>=20&&v<=2000?v:null
}
function getWarmup(text:string){
 const m=text.match(/(\d+(?:[.,]\d+)?)\s*km.{0,85}?(?:einlaufen|warm\s*up)/i)||
  text.match(/(?:einlaufen|warm\s*up).{0,85}?(\d+(?:[.,]\d+)?)\s*km/i)
 if(!m)return null
 const metres=Math.round(Number(m[1].replace(',','.'))*1000)
 return metres>=100&&metres<=50000?metres:null
}
export function interpretSpatialTrainerPhoto(result:SpatialOcrResult):SpatialWorkoutDraft{
 const recognizedText=result.text.slice(0,14000)
 const warnings:string[]=[],incompleteGroups:string[]=[]
 const groups:TrainerGroup[]=[]
 const seen=new Set<string>()
 const recovery=getRecovery(recognizedText)
 for(const card of result.rows.slice(0,12)){
  const name=card.name.trim().slice(0,50),key=name.toLocaleLowerCase('de-DE')
  if(!name||seen.has(key))continue
  seen.add(key)
  const reps=parseReps(card.leftText)
  if(!reps){
   incompleteGroups.push(name)
   warnings.push(name+': Intervallanzahl oder Distanz nicht sicher erkannt.')
   groups.push({name,notes:'Originalbild: Anzahl und Distanz ergänzen',
    steps:[{kind:'run',distanceMeters:null,durationSeconds:null,
     paceSecondsPerKm:null,notes:'Trainer-Grafik prüfen'}]})
   continue
  }
  const blocks=parseBlocks(card.leftText,reps.count)
  const paces=rowPaces(card.rightText)
  if(reps.uncertain)warnings.push(name+': '+reps.count+' × '+reps.meters+
   ' m aus unscharfer Schrift gelesen – bitte prüfen.')
  if(!blocks)warnings.push(name+': Satzaufteilung nicht eindeutig erkannt.')
  if(paces.length<reps.count){
   warnings.push(name+': Nur '+paces.length+' von '+reps.count+
    ' Paces erkannt; fehlende Werte bleiben offen.')
   incompleteGroups.push(name)
  }
  if(paces.length>reps.count)warnings.push(name+': Mehr Paces als Intervalle gefunden – Original prüfen.')
  const steps:TrainerStep[]=[]
  for(let i=0;i<reps.count;i++){
   steps.push({kind:'run',distanceMeters:reps.meters,durationSeconds:null,
    paceSecondsPerKm:paces[i]??null,notes:'OCR: Tempo mit Trainer-Grafik vergleichen'})
   if(i<reps.count-1)steps.push({kind:'recovery',distanceMeters:recovery,
    durationSeconds:null,paceSecondsPerKm:null,notes:recovery===null?
     'Trabpause und Distanz im Bild kontrollieren':'Trabpause: '+recovery+' m; Serienpause prüfen'})
  }
  groups.push({name,notes:blocks?'Blöcke laut Bild: '+blocks.join(' + '):
   'Satzaufteilung aus der Grafik prüfen',steps})
 }
 if(groups.length===0)return {workout:null,warnings:['Keine Gruppe sicher erkannt.'],
  recognizedText,detectedGroups:0,incompleteGroups:[]}
 const workout=blankTrainerWorkout()
 workout.title=recognizedText.match(/schwelle\s+im\s+wechsel/i)?.[0]||
  'Trainingsgrafik – Titel prüfen'
 workout.trainer=/oerlinghausen|örlinghausen|runcrew|\borc\b/i.test(recognizedText)?
  'ORC Runcrew':''
 workout.sourceLabel='Trainer-Foto · gruppenweise lokale OCR'
 workout.warmup={distanceMeters:getWarmup(recognizedText),
  durationSeconds:null,notes:'Einlaufen und Übungen im Original kontrollieren'}
 workout.cooldown={distanceMeters:null,durationSeconds:null,
  notes:'Auslaufen im Original kontrollieren'}
 workout.groups=groups
 warnings.unshift('Zeilenweise OCR: alle Gruppen und Paces vor dem Archivieren kontrollieren.')
 return {workout,warnings,recognizedText,detectedGroups:groups.length,
  incompleteGroups:[...new Set(incompleteGroups)]}
}
/** A detected group with no run distance must not be archived by accident. */
export function spatialPhotoReviewIssues(workout:TrainerWorkout):string[]{
 return workout.groups.flatMap(group=>{
  const runs=group.steps.filter(s=>s.kind==='run')
  return runs.length===0||runs.some(s=>s.distanceMeters===null&&s.durationSeconds===null)?
   [group.name+': Belastungsdistanz oder Dauer fehlt']:[]
 })
}
