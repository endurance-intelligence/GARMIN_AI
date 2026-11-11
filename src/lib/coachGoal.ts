/** Explicit race objective, never a synthetic readiness metric.
 * Calendar phase is derived from the user's chosen race date.
 * It cannot override illness symptoms, race rules or medical guidance.
 */
export type CoachGoal={
 race_name:string;race_date:string;distance_km:number;target_hours:number|null;
 race_location:string;race_start_time:string|null;coach_note:string;updated_at:string
}
export type CoachPhase='base'|'build'|'specific'|'peak'|'taper'|'race'|'recovery'|'expired'
export function berlinDateToday(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date(now))
 const value=(key:string)=>parts.find(x=>x.type===key)?.value||''
 return value('year')+'-'+value('month')+'-'+value('day')
}
function ordinal(d:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Invalid date')
 const n=Date.parse(d+'T12:00:00Z')
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==d)
  throw Error('Invalid date')
 return Math.floor(n/86400000)
}
export function phaseForRace(raceDate:string,today=berlinDateToday()):{
 phase:CoachPhase;daysUntil:number;title:string;guidance:string
}{
 const daysUntil=ordinal(raceDate)-ordinal(today)
 if(daysUntil< -14)return {phase:'expired',daysUntil,
  title:'Ziel aktualisieren',guidance:'Der Wettkampf liegt zurück. Trage dein nächstes Ziel ein.'}
 if(daysUntil<0)return {phase:'recovery',daysUntil,
  title:'Regeneration',guidance:'Erholung nach dem Wettkampf priorisieren. Belastung nach tatsächlichem Befinden gestalten.'}
 if(daysUntil===0)return {phase:'race',daysUntil,
  title:'Wettkampftag',guidance:'Renntag. Keine zusätzliche Trainingseinheit einplanen.'}
 if(daysUntil<=10)return {phase:'taper',daysUntil,
  title:'Tapering',guidance:'Trainingsumfang reduzieren, Erholung sichern, keine versäumten Kilometer nachholen.'}
 if(daysUntil<=21)return {phase:'peak',daysUntil,
  title:'Wettkampfspezifisch',guidance:'Letzte sinnvolle spezifische Reize – Intensität und Umfang individuell prüfen.'}
 if(daysUntil<=56)return {phase:'specific',daysUntil,
  title:'Spezifische Vorbereitung',guidance:'Wettkampfspezifische Einheiten und Versorgung erproben; Erholung beachten.'}
 if(daysUntil<=98)return {phase:'build',daysUntil,
  title:'Aufbau',guidance:'Belastung schrittweise anpassen. Regeneration und Krafttraining integrieren.'}
 return {phase:'base',daysUntil,
  title:'Grundlagenphase',guidance:'Konstanz, aerobe Grundlage und allgemeine Kraft ohne unnötige Spitzen.'}
}
export const suggestedGoal:Omit<CoachGoal,'updated_at'>={
 race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',
 distance_km:112,target_hours:15,race_location:'Fulda',
 race_start_time:null,coach_note:'112 km in 15 Stunden. Wetter, Erholung und Versorgung berücksichtigen.'
}
