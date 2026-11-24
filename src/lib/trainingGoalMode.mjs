/** A previous race is an historical reference, not a future training objective. */
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(Date.parse(s+'T12:00:00Z')).toISOString().slice(0,10)===s
export function getTrainingGoalMode(goal,today){
 if(!isDate(today)||!isDate(goal?.race_date))return {mode:'choose',weeklyKm:null,activeRaceDate:null}
 if(goal.race_date>=today)return {mode:'race',weeklyKm:null,activeRaceDate:goal.race_date}
 const km=goal.maintenance_weekly_km
 return typeof km==='number'&&Number.isFinite(km)&&km>=1&&km<=200?
  {mode:'maintenance',weeklyKm:km,activeRaceDate:null}:
  {mode:'choose',weeklyKm:null,activeRaceDate:null}
}
