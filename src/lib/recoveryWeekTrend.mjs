/** Compare the last two COMPLETE seven-calendar-day recovery windows
 * ending on the latest measured date; no universal HRV or medical thresholds.
 */
const ok=v=>typeof v==='number'&&Number.isFinite(v)
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const median=items=>{const s=[...items].sort((a,b)=>a-b);return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):null}
export function recoveryWeekTrend(history,date){
 if(!Array.isArray(history)||!/^(?:19|20)\d\d-\d\d-\d\d$/.test(date))return null
 const metric=(key,low,high)=>{
  const windows=[[-6,0],[-13,-7]].map(([from,to])=>{
   const first=shift(date,from),last=shift(date,to)
   return history.filter(r=>r.metric_date>=first&&r.metric_date<=last)
    .map(r=>r[key]).filter(v=>ok(v)&&v>=low&&v<=high)
  })
  if(windows.some(w=>w.length<4))return null
  return {current:median(windows[0]),previous:median(windows[1]),
   sampleCurrent:windows[0].length,samplePrevious:windows[1].length}
 }
 const hrv=metric('hrv_ms',10,250),sleep=metric('sleep_seconds',3*3600,16*3600),
  rhr=metric('resting_heart_rate',25,110)
 if(!hrv&&!sleep&&!rhr)return null
 const hrvChange=hrv?.previous>0?(hrv.current-hrv.previous)/hrv.previous:null
 const hrvSentence=hrvChange===null?'HRV-Wochentrend nicht ausreichend belegt.':
  hrvChange<=-.15?'Der HRV-Median der letzten sieben Tage liegt deutlich unter der Vorwoche.':
  hrvChange>=.15?'Der HRV-Median der letzten sieben Tage liegt deutlich über der Vorwoche.':
  'Der HRV-Median der letzten sieben Tage ist ungefähr stabil.'
 const rhrSentence=rhr?(Math.abs(rhr.current-rhr.previous)<=3?
  'Der Ruhepuls-Median ist ähnlich.':
  rhr.current>rhr.previous?'Der Ruhepuls-Median liegt höher.':'Der Ruhepuls-Median liegt niedriger.'):''
 const sleepSentence=sleep?(Math.abs(sleep.current-sleep.previous)<1800?
  'Die mittlere Schlafdauer ist ähnlich.':
  sleep.current>sleep.previous?'Der Schlaf-Median liegt höher.':'Der Schlaf-Median liegt niedriger.'):''
 return {hrv,sleep,rhr,summary:[hrvSentence,rhrSentence,sleepSentence].filter(Boolean).join(' '),
  note:'7-Tage-Mediane; die heutige Abweichung ist eine separate Beobachtung, keine Diagnose.'}
}
