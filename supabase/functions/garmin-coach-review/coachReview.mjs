/** GARMIN_AI v0.9.61: Evidence-based reviews for real Garmin activities. */
const n = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const valid = value => Number.isFinite(value)
const dateOf = activity => String(activity.start_time_local || activity.date || '').slice(0, 10)
const run = activity => /run|jog|trail|treadmill/i.test(String(activity.sport_type || ''))
const lapsOf = details => Array.isArray(details?.fit_laps) ? details.fit_laps.filter(x => x && typeof x === 'object') : []
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000)
const pace = seconds => { const s=Math.round(seconds); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0') }
const de = (value, decimals=1) => value.toLocaleString('de-DE', {maximumFractionDigits:decimals,minimumFractionDigits:decimals})
const knownGoal = goal => goal && /^\d{4}-\d{2}-\d{2}$/.test(String(goal.race_date || '')) && typeof goal.race_name === 'string'
const percentage = (value, reference) => reference > 0 ? Math.abs(value-reference)/reference*100 : null

export function classifyRun(activity, details={}) {
 const title=String(activity.activity_name || '').toLowerCase()
 const laps=lapsOf(details)
 const active=laps.filter(l=>String(l.intensity)==='active' && n(l.distanceM)>=200)
 const recoveries=laps.filter(l=>/recovery|rest/.test(String(l.intensity)))
 if(active.length>=2 && recoveries.length>=1)return 'intervals'
 if(/locker|easy|regenerativ|recovery/.test(title))return 'easy'
 if(/intervall|interval|bahn|track|wiederholung|\d+\s*[x×]\s*\d{3,4}/.test(title))return 'intervals'
 if(/long|langer lauf|ultra|langlauf/.test(title) || n(activity.distance_m)>=18000)return 'long'
 if(/tempo|schwelle|threshold/.test(title))return 'tempo'
 return 'steady'
}
function goalFinding(date, goal, type) {
 if(!knownGoal(goal))return 'Hauptziel nicht verfügbar: keine Wettkampfprognose abgeleitet.'
 const remaining=daysBetween(date,String(goal.race_date))
 const name=goal.race_name.slice(0,85)
 if(remaining>=0 && remaining<=10){
  const taper=type==='intervals'?'Einzelne gute Wiederholungen sind kein Grund für weitere harte Reize.':
   type==='easy'||type==='recovery'?'Ein ruhiger Lauf passt zur Frische-Erhaltung, sofern er sich tatsächlich locker angefühlt hat.':
   'Jetzt keine Trainingskilometer nachholen oder ungeplante Belastung ergänzen.'
  return `${name} in ${remaining} Tagen: Taper und Frische priorisieren. ${taper}`
 }
 if(remaining>10 && remaining<=50)return `${name} in ${remaining} Tagen: ${type==='intervals'?'Guter Temposchwerpunkt ersetzt nicht die spezifische Ausdauerarbeit.':'Belastung und Erholung über mehrere Wochen beobachten.'}`
 if(remaining>50)return `${name} in ${remaining} Tagen: Den Trainingsverlauf und die langfristige Belastbarkeit im Blick behalten.`
 return `${name} liegt bereits zurück. Für künftige Empfehlungen braucht es ein neues Hauptziel.`
}
export function buildActivityCoach(activity,details={},goal=null) {
 if(!run(activity))return null
 const date=dateOf(activity)
 const type=classifyRun(activity,details)
 const laps=lapsOf(details)
 const efforts=laps.filter(l=>String(l.intensity)==='active' && n(l.distanceM)>=200 && n(l.avgSpeed)>0.8 && n(l.elapsedS)>0)
 const avgHr=n(activity.average_heart_rate)
 let positive='',attention='',headline='',quality='limited'
 const facts=[]
 if(type==='intervals' && efforts.length>=2) {
  const paces=efforts.map(l=>1000/Number(l.avgSpeed))
  const avg=paces.reduce((a,b)=>a+b,0)/paces.length
  const spread=100*(Math.max(...paces)-Math.min(...paces))/avg
  const first=paces[0],last=paces.at(-1)
  const lastChange=100*(last-first)/first
  const trend=lastChange<=-3?'zum Ende schneller':lastChange>=3?'zum Ende langsamer':'ohne deutlichen Tempoabfall'
  const even=spread<=4?'konstante Wiederholungen':spread<=8?'gewisse Tempounterschiede':'deutliche Pace-Unterschiede'
  headline=spread<=4?'Intervalle sauber eingeteilt.':spread<=8?'Intervalle mit Tempovariation.':'Tempoeinteilung ausbaufähig.'
  positive=`${efforts.length} Belastungsabschnitte: ${even}, ${trend}. Erste/letzte Pace ${pace(first)} / ${pace(last)} min/km.`
  const hf1=n(efforts[0].avgHr), hf2=n(efforts.at(-1).avgHr)
  attention=hf1!==null&&hf2!==null?`HF der Belastungsabschnitte: Ø ${Math.round(hf1)} → ${Math.round(hf2)} bpm. ${hf2-hf1>=7?'Anstieg im Verlauf; bei Intervallen erwartbar, aber die Belastung war nicht trivial.':'Kein ausgeprägter Anstieg zwischen erster und letzter Wiederholung.'}`:
   'HF je Wiederholung fehlt; Pace bleibt unabhängig davon beurteilbar.'
  facts.push(`${efforts.length} Belastungen`,`${Math.round(spread)} % Pace-Spanne`)
  quality='fit-intervals'
 } else if(type==='intervals') {
  headline='Intervalltraining erkannt, Ausführung noch nicht vollständig beurteilbar.'
  positive='Lauf als Intervalltraining erfasst; die einzelnen Belastungsabschnitte sind nicht eindeutig zugeordnet.'
  attention=avgHr!==null?`Ø HF der gesamten Aktivität ${Math.round(avgHr)} bpm – inklusive Ein- und Auslaufen, daher keine Intervall-HF.`:'HF der Intervalle nicht verfügbar.'
 } else {
  const kilometer=laps.filter(l=>n(l.distanceM)>=750 && n(l.avgSpeed)>0.8)
  headline=type==='easy'?'Als locker bezeichnet – HF-Verlauf geprüft.':type==='long'?'Langer Lauf – Ausdauerverlauf im Fokus.':'Dauerlauf – Tempo und Puls im Blick.'
  const km= n(activity.distance_m)!==null?de(n(activity.distance_m)/1000)+' km':'Lauf'
  positive=avgHr!==null?`${km}, Ø ${Math.round(avgHr)} bpm.`:`${km}.`
  if(kilometer.length>=4){
   const speeds=kilometer.map(l=>Number(l.avgSpeed)),mean=speeds.reduce((a,b)=>a+b,0)/speeds.length
   const spread=(Math.max(...speeds)-Math.min(...speeds))/mean*100
   positive+=` Kilometerabschnitte mit ${Math.round(spread)} % Geschwindigkeitsspanne. Unterschiedliche Pace ist allein kein Zeichen für schlechte Ausführung.`
   facts.push(`${Math.round(spread)} % Geschwindigkeitsspanne`)
   // First/last km alone misses what happened between. Compare both halves
   // instead, and never call this cardiac drift when pace or terrain varies.
   const halves=Math.floor(kilometer.length/2)
   const first=kilometer.slice(0,halves),second=kilometer.slice(halves)
   const avg=(xs,key)=>{const vals=xs.map(x=>n(x[key])).filter(x=>x!==null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
   const h1=avg(first,'avgHr'),h2=avg(second,'avgHr')
   const v1=avg(first,'avgSpeed'),v2=avg(second,'avgSpeed')
   const speedDelta=v1!==null&&v2!==null&&v1>0?100*(v2/v1-1):null
   const varying=speedDelta!==null&&Math.abs(speedDelta)>5
   attention=h1!==null&&h2!==null?
    `HF erste/zweite Streckenhälfte Ø ${Math.round(h1)} → ${Math.round(h2)} bpm.`+
    (speedDelta!==null?` Tempo zweite Hälfte ${Math.round(Math.abs(speedDelta))} % ${speedDelta>=0?'schneller':'langsamer'}.`:'')+
    (varying?' Bei unterschiedlichem Tempo ist daraus kein belastbarer Cardiac Drift ableitbar.':
     ' Ohne gesicherte vergleichbare Bedingungen ist das noch kein Beleg für Cardiac Drift.') :
    'Für eine verlässliche HF-Verlaufsbewertung fehlen Abschnittswerte.'
   const terrain=Array.isArray(details.fit_terrain)?details.fit_terrain:[]
   const uphill=terrain.some(x=>x?.terrain==='uphill'||n(x?.gradePct)>=3)
   const downhill=terrain.some(x=>x?.terrain==='downhill'||n(x?.gradePct)<=-3)
   if(uphill||downhill)positive+=` Das FIT-Streckenprofil enthält ${uphill&&downhill?'Anstiege und Gefälle':uphill?'Anstiege':'Gefälle'}; die Pace-Schwankungen müssen im Gelände-Kontext gelesen werden.`
   quality='fit-kilometers'
  }else attention='Kilometerabschnitte fehlen; Tempoverlauf kann nicht beurteilt werden.'
  if(type==='easy')attention+=' „Locker“ stammt zunächst aus dem Aktivitätsnamen; die konfigurierten HF-Zonen und dein Empfinden liefern weiteren Kontext, aber keine automatisch bestimmte LT1.'
 }
 const goalText=goalFinding(date,goal,type)
 return {activityId:String(activity.activity_id||activity.id),date,name:String(activity.activity_name||'Lauf').slice(0,130),
  type,headline,positive,attention,goal:goalText,quality,facts,
  averageHr:avgHr,
  kilometerHrs:type==='intervals'?[]:laps.filter(l=>n(l.distanceM)>=750&&n(l.avgSpeed)>0.8).map(l=>n(l.avgHr)).filter(h=>h!==null),
  short:[headline,positive,goalText].join(' ').slice(0,600),source:'Garmin FIT'}
}
export function buildWeeklyCoach(activities,detailsById,goal,weekStart){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))throw Error('Invalid week date')
 const start=Date.parse(weekStart+'T12:00:00Z')
 const plus=d=>new Date(start+d*86400000).toISOString().slice(0,10)
 const inRange=(from,to)=>activities.filter(a=>dateOf(a)>=from&&dateOf(a)<to)
 const current=inRange(weekStart,plus(7)),before=inRange(plus(-7),weekStart)
 const runs=current.filter(run),previous=before.filter(run)
 const dist=list=>list.reduce((sum,a)=>sum+(n(a.distance_m)||0),0)/1000
 const hours=list=>list.reduce((sum,a)=>sum+(n(a.duration_s)||0),0)/3600
 const hard=runs.filter(a=>classifyRun(a,detailsById[String(a.activity_id)]||{})==='intervals').length
 const football=current.filter(a=>/soccer|football/i.test(String(a.sport_type||''))).length
 const observation=`${runs.length} ${runs.length===1?'Lauf':'Läufe'}, ${de(dist(runs))} km (Vorwoche ${de(dist(previous))} km)`+(football?`, zusätzlich ${football} × Fußball.`:'.')
 const effort=hard?`${hard} Intervalltraining${hard===1?'':'s'} mit höherem Intensitätsreiz erkannt.`:'Keine klar identifizierten Intervallläufe; die Trainingsbelastung ist damit nicht automatisch niedrig.'
 let next='Die nächste Woche nach Trainingsphase, subjektiver Ermüdung und Verlauf gestalten; nicht nur nach Kilometern.'
 if(knownGoal(goal)){
  const left=daysBetween(plus(7),goal.race_date)
  if(left>=0&&left<=10)next=`${goal.race_name} steht bevor (in ${left} Tagen nach Wochenabschluss). Jetzt Taper und Frische priorisieren; keine Kilometer nachholen.`
 }
 return {weekStart,endExclusive:plus(7),runCount:runs.length,distanceKm:dist(runs),previousKm:dist(previous),runningHours:hours(runs),intervalCount:hard,footballCount:football,observation,effort,next,short:[observation,effort,next].join(' ')}
}