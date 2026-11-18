/** GARMIN_AI · evidence-led personal Intervals.icu load comparison.
 * Positive activity loads are compared only against real historical activities.
 * There is NO universal "97 is hard" threshold, no invented zero-load weeks,
 * no duplicate counting and no automatic training-plan change.
 */
const num=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value)
const dayOf=x=>String(x||'').slice(0,10)
const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const uniqueValues=arr=>[...new Set(arr)]
const median=arr=>{const s=[...arr].sort((a,b)=>a-b);return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):null}
const rounded=x=>Math.round(x*10)/10
const run=x=>/run/i.test(String(x?.type||''))
const validLoad=x=>{const v=num(x?.icu_training_load);return v!==null&&v>0&&v<=1500?v:null}
const keyOf=x=>String(x?.id||'')
/** Normalize by source activity ID and near-identical same-sport start/distance.
 * Duplicate provider syncs must never inflate weekly totals. */
export function completedLoadActivities(rows){
 if(!Array.isArray(rows))return []
 const sorted=rows.filter(x=>validDay(dayOf(x?.start_date_local))&&validLoad(x)!==null)
  .sort((a,b)=>String(a.start_date_local).localeCompare(String(b.start_date_local)))
 const result=[],ids=new Set()
 for(const a of sorted){
  const id=keyOf(a)
  if(id&&ids.has(id))continue
  if(id)ids.add(id)
  const time=String(a.start_date_local||'').slice(0,16)
  const dist=num(a.distance),sport=String(a.type||'')
  const duplicate=result.some(b=>{
   if(!sport||String(b.type||'')!==sport)return false
   if(!time||!String(b.start_date_local||''))return false
   const bt=String(b.start_date_local).slice(0,16)
   const tm=Date.parse(time.replace(' ','T')+':00Z'),bm=Date.parse(bt.replace(' ','T')+':00Z')
   const bd=num(b.distance)
   return Number.isFinite(tm)&&Number.isFinite(bm)&&Math.abs(tm-bm)<=120000&&dist!==null&&bd!==null&&
    Math.abs(dist-bd)<=Math.max(150,dist*.02)
  })
  if(!duplicate)result.push(a)
 }
 return result
}
const category=ratio=>ratio>=1.3?'higher':ratio<=.75?'lower':'usual'
/** Compare a running workout against prior eight weeks of running workouts.
 * This is RELATIVE single-session load, not quality and not a universal intensity grade. */
export function activityLoadComparison(rows,targetLoad,targetDay){
 const load=num(targetLoad),day=dayOf(targetDay)
 if(!validDay(day)||load===null||load<0||load>1500)return null
 const start=shiftDay(day,-56)
 const history=completedLoadActivities(rows).filter(a=>run(a)&&dayOf(a.start_date_local)>=start&&dayOf(a.start_date_local)<day)
 const weeks=uniqueValues(history.map(a=>Math.floor((Date.parse(day+'T12:00:00Z')-Date.parse(dayOf(a.start_date_local)+'T12:00:00Z'))/604800000)))
 // Multiple workouts in one week aren't an adequate longitudinal baseline.
 if(history.length<6||weeks.length<3)return {available:false,reason:'few-running-sessions',count:history.length,weekCount:weeks.length}
 const baseline=median(history.map(validLoad)),ratio=baseline?load/baseline:null
 if(!baseline||ratio===null)return null
 const lower=history.filter(a=>validLoad(a)<load).length
 return {available:true,load:rounded(load),median:rounded(baseline),ratio:rounded(ratio),
  category:category(ratio),count:history.length,weekCount:weeks.length,
  higherThan:lower,windowDays:56,
  source:'Intervals.icu Aktivitäten · zurückliegende 8 Wochen',
  note:'Vergleich mit allen erfassten Läufen unterschiedlicher Dauer, keine Qualitätsnote und kein Ersatz für Erholung oder RPE.'}
}
/** Completed week vs previous four complete weeks (all sports).
 * In-progress weeks are not compared with seven-day averages.
 * Missing history is unknown, not zero. */
export function weekLoadComparison(rows,weekStart,today){
 const start=dayOf(weekStart),now=dayOf(today)
 if(!validDay(start)||!validDay(now))return null
 const activities=completedLoadActivities(rows)
 const weekData=(d)=>{const end=shiftDay(d,7),a=activities.filter(x=>dayOf(x.start_date_local)>=d&&dayOf(x.start_date_local)<end)
  return {start:d,load:rounded(a.reduce((s,x)=>s+validLoad(x),0)),count:a.length,runCount:a.filter(run).length}
 }
 // In the running week, evaluate the LAST completed week instead of falsely
 // comparing 1–2 days with an entire week. Date and scope stay explicit.
 const selectedComplete=shiftDay(start,6)<now
 const compareStart=selectedComplete?start:shiftDay(start,-7)
 if(shiftDay(compareStart,6)>=now)return {available:false,reason:'no-completed-week'}
 const current=weekData(compareStart),prev=Array.from({length:4},(_,i)=>weekData(shiftDay(compareStart,-7*(i+1))))
 const withData=prev.filter(w=>w.count>0)
 if(current.count===0||withData.length<3)return {available:false,reason:'incomplete-week-history',
  current,weekStart:compareStart,previousWeeks:withData.length,complete:true}
 const baseline=median(withData.map(w=>w.load))
 if(!baseline)return {available:false,reason:'no-valid-baseline',current,previousWeeks:withData.length,complete:true}
 const ratio=current.load/baseline
 return {available:true,complete:true,weekStart:compareStart,isPreviousWeek:!selectedComplete,
  load:current.load,baseline:rounded(baseline),
  ratio:rounded(ratio),category:category(ratio),previousWeeks:withData.length,
  activityCount:current.count,runCount:current.runCount,
  source:'Intervals.icu · alle Sportarten; 4 Vorwochen als Referenz',
  note:'Nur erfasste Intervals.icu-Aktivitäten. Fehlende Garmin-Importe können den Vergleich verzerren.'}
}
/** Non-prescriptive coach phrasing, optionally race-sensitive. */
export function loadCoachFinding(comparison,kind,goal,asOfDay){
 if(!comparison?.available)return null
 const high=comparison.category==='higher',low=comparison.category==='lower'
 const label=kind==='activity'?'Einzelbelastung':'Wochenbelastung'
 const sentence=high?'über deinem bisherigen Vergleichswert':low?'unter deinem bisherigen Vergleichswert':'im Bereich deiner bisherigen Vergleichswerte'
 const raceDate=dayOf(goal?.race_date),day=dayOf(asOfDay)
 const days=validDay(raceDate)&&validDay(day)?Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000):null
 let next='Diesen Wert zusammen mit RPE, Intensität der Einheiten und Erholung betrachten, nicht isoliert als Trainingsfreigabe.'
 if(days!==null&&days>=0&&days<=10)
  next='Wettkampf in '+days+' Tagen: Frische hat Vorrang; keine ausgefallenen Kilometer oder harten Reize nachholen.'
 else if(high)
  next='Ein überdurchschnittlicher Reiz. Vor dem nächsten harten Training Erholung und weitere Wochenbelastung prüfen.'
 else if(low)
  next='Geringere Belastung ist nicht automatisch zu wenig Training; die Trainingsphase und Erholung entscheiden.'
 return {label,category:comparison.category,text:label+' liegt '+sentence+'. '+next,daysToRace:days}
}
