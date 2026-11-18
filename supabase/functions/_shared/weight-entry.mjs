/** Strict, locale-neutral manual kg entry for a single daily weigh-in. */
export function validWeightEntry(data, todayMs=Date.now()) {
  if(!data || typeof data!=='object' || Array.isArray(data))return null
  const date=data.date,kg=data.kg
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  const d=new Date(date+'T00:00:00.000Z')
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null
  if(typeof kg!=='number'||!Number.isFinite(kg) || kg<30 || kg>300 ||
     Math.abs(kg*100-Math.round(kg*100))>0.00001)return null
  if(d.getTime()<todayMs-31*86400000||d.getTime()>todayMs+86400000)return null
  return {date,kg}
}
