/**
 * Race-day voluntary fuel notes only.
 * Never infer ingestion from GPS, a completed lap, a planned meal, or time.
 * An entry is a USER'S explicit qualitative answer, not measured kcal/CHO.
 */
export const FUEL_MARK_STATUSES=['planned','different','skipped']
export function validFuelMarks(marks,{completed,total}={}){
 if(!marks||typeof marks!=='object'||Array.isArray(marks)||
  !Number.isInteger(completed)||!Number.isInteger(total)||completed<0||
  total<1||completed>total)return null
 const entries=Object.entries(marks)
 if(entries.length>total)return null
 const clean={}
 for(const [key,value] of entries){
  if(!/^[1-9]\d*$/.test(key))return null
  const round=Number(key)
  if(!Number.isInteger(round)||round>completed||round>total||
   !FUEL_MARK_STATUSES.includes(value))return null
  clean[key]=value
 }
 return clean
}
export function updateFuelMark(marks,{round,completed,total,status}={}){
 const current=validFuelMarks(marks,{completed,total})
 if(!current||!Number.isInteger(round)||round<1||round>completed||
  round>total||(status!==null&&!FUEL_MARK_STATUSES.includes(status)))
  return {ok:false,reason:'Verpflegungseintrag ungültig. Keine Änderung vorgenommen.',marks}
 const next={...current}
 if(status===null)delete next[String(round)]
 else next[String(round)]=status
 return {ok:true,reason:null,marks:next}
}
export function recentFuelFeedback(marks,{completed,total}={}){
 const current=validFuelMarks(marks,{completed,total})
 if(!current||completed===0)return null
 const status=current[String(completed)]
 if(!status)return null
 return {round:completed,status,
  text:status==='skipped'?
   'Letzte Runde: Versorgung ausgelassen. Nächste verträgliche KH-Quelle prüfen; nicht alles auf einmal nachholen.':
   status==='different'?
   'Letzte Runde: anders versorgt. KH-Menge ist unbekannt; nächste Portion bewusst prüfen.':
   'Letzte Runde: Versorgung wie geplant bestätigt.',
  confirmedByUser:true}
}
