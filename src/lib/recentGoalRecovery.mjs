const DAY=86400000
const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(Date.parse(s+'T12:00:00Z')).toISOString().slice(0,10)===s
/** Protect recovery after a recorded previous goal even when a new race is selected.
 * Planned distance is context, not proof of completion.
 */
export function recentGoalRecovery({today,racePortfolio}={}){
 if(!valid(today))return null
 const rows=Array.isArray(racePortfolio?.others)?racePortfolio.others:[]
 const recent=rows.filter(x=>valid(x?.race_date)&&x.race_date<today&&Number(x.distance_km)>0)
  .map(x=>({name:String(x.race_name||'dem letzten Wettkampf'),date:x.race_date,
   daysSince:Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(x.race_date+'T12:00:00Z'))/DAY)}))
  .filter(x=>x.daysSince<=14).sort((a,b)=>b.date.localeCompare(a.date))[0]
 if(!recent)return null
 const until=new Date(Date.parse(recent.date+'T12:00:00Z')+14*DAY).toISOString().slice(0,10)
 return {...recent,until,message:'Erholung nach '+recent.name+' ('+recent.daysSince+' Tage seit dem Rennen) hat Vorrang. Keine fehlenden Kilometer nachholen; erst die Tagesempfehlung und Verträglichkeit prüfen.'}
}
