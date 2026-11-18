/**
 * Garmin directWorkoutRpe and directWorkoutFeel (self-reported after the workout).
 * The activity service stores RPE as 10..100, so 70 means 7/10.
 * Feel is one of 0/25/50/75/100; higher means feeling stronger.
 * These values do NOT describe leg soreness or diagnose an illness.
 * Do not infer missing ratings from HR, pace, notes or Intervals.icu load.
 */
const DAY=86400000
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const daysBefore=(iso,n)=>new Date(Date.parse(iso+'T12:00:00Z')-n*DAY).toISOString().slice(0,10)
export const normalizeGarminRpe=value=>
 typeof value==='number'&&Number.isInteger(value)&&value>=10&&value<=100&&value%10===0?
  value/10:null
export const normalizeGarminFeeling=value=>
 typeof value==='number'&&[0,25,50,75,100].includes(value)?value:null
export const garminFeelingLabel=value=>{
 const normalized=normalizeGarminFeeling(value)
 return normalized===null?null:{
  0:'Sehr schwach',25:'Schwach',50:'Normal',75:'Gut',100:'Sehr gut'
 }[normalized]
}
export function analyzeGarminPerception(boards,today){
 const empty={source:'Garmin · eigene Bewertung nach dem Training',count14:0,count28:0,
  feelingCount14:0,hardCount14:0,veryHardCount14:0,
  recentHardCount:0,averageRpe14:null,latest:null,
  level:'unknown',qualityCaution:false,needsRecovery:false,
  title:'Deine Garmin-Rückmeldungen',summary:'Noch keine Garmin-Bewertung für die geladenen Einheiten.',
  advice:'Bewertungen direkt nach dem Training in Garmin erfassen. Kein zweites Formular nötig.'}
 if(!validDate(today)||!Array.isArray(boards))return empty
 const floor28=daysBefore(today,27),floor14=daysBefore(today,13),floor3=daysBefore(today,2)
 const byId=new Map()
 for(const board of boards){
  if(!Array.isArray(board?.activities))continue
  for(const a of board.activities){
   const id=a?.activity_id
   if((typeof id!=='string'&&typeof id!=='number')||!String(id))continue
   const day=String(a.start_time_local||'').slice(0,10)
   if(!validDate(day)||day<floor28||day>today)continue
   const rpe=normalizeGarminRpe(a.rpe_raw)
   const feeling=normalizeGarminFeeling(a.feeling_raw)
   if(rpe===null&&feeling===null)continue
   const existing=byId.get(String(id))
   // Prefer the richest row when a sync returns the same activity twice.
   if(!existing||(Number(rpe!==null)+Number(feeling!==null))>
    (Number(existing.rpe!==null)+Number(existing.feeling!==null)))
    byId.set(String(id),{activityId:String(id),date:day,
     title:String(a.activity_name||a.sport_type||'Garmin-Einheit').slice(0,90),
     rpe,feeling,feelingLabel:garminFeelingLabel(feeling)})
  }
 }
 const all=[...byId.values()].sort((a,b)=>b.date.localeCompare(a.date)||
  b.activityId.localeCompare(a.activityId))
 const latest=all[0]||null
 const rpe14=all.filter(x=>x.date>=floor14&&x.rpe!==null)
 const feelings14=all.filter(x=>x.date>=floor14&&x.feeling!==null)
 const hardCount14=rpe14.filter(x=>x.rpe>=8).length
 const veryHardCount14=rpe14.filter(x=>x.rpe>=9).length
 const recent=all.filter(x=>x.date>=floor3)
 const recentHardCount=recent.filter(x=>x.rpe!==null&&x.rpe>=8).length
 const recentVeryHard=recent.some(x=>x.rpe!==null&&x.rpe>=9)
 const recentWeak=recent.some(x=>x.feeling!==null&&x.feeling<=25)
 const needsRecovery=recentVeryHard||recentWeak
 const qualityCaution=needsRecovery||recentHardCount>=2
 const count14=rpe14.length,count28=all.filter(x=>x.rpe!==null).length
 const averageRpe14=count14?
  Math.round(rpe14.reduce((s,x)=>s+x.rpe,0)/count14*10)/10:null
 const level=needsRecovery?'high':qualityCaution?'caution':count14>0?'normal':'unknown'
 const summary=count14?
  count14+' echte Garmin-Anstrengungsbewertungen in den geladenen letzten 14 Tagen'+
   (hardCount14?' · '+hardCount14+' mal 8/10 oder höher':'')+'.':
  feelings14.length?
   feelings14.length+' Garmin-Gefühlsbewertungen, noch keine auswertbare Anstrengung.':
   'Noch keine auswertbare Garmin-Bewertung in den geladenen letzten 14 Tagen.'
 const advice=needsRecovery?
  'Die jüngste Garmin-Bewertung zeigt eine sehr harte Einheit oder schwaches Gefühl. '+
   'Die nächsten Trainingstage lieber locker halten und Erholung prüfen.':
  qualityCaution?
   'Mehrere kürzlich sehr anstrengende Einheiten: vor dem nächsten harten Reiz Erholung prüfen.':
  count14?
   'Coach nutzt diese Angaben zusammen mit tatsächlichem Training und Erholung, '+
   'ohne eine zweite Bewertung zu verlangen.':
   'In Garmin nach der Aktivität bewerten; der Coach übernimmt verfügbare Werte automatisch.'
 return {...empty,count14,count28,feelingCount14:feelings14.length,
  hardCount14,veryHardCount14,recentHardCount,averageRpe14,latest,
  level,needsRecovery,qualityCaution,summary,advice}
}
