/** Athlete-entered subjective training feedback. No fake readiness scores or diagnoses. */
export function evaluateWorkoutFeedback(f){
 if(!f||!Number.isInteger(f.rpe)||f.rpe<1||f.rpe>10)return {
  level:'missing',title:'Feedback fehlt',message:'Wie hart war die Einheit wirklich?',
  avoidHard:false,preferRest:false
 }
 if(f.symptoms==='clear')return {
  level:'warning',title:'Beschwerden gemeldet',
  message:'Du hast deutliche Beschwerden angegeben. Keine neue Belastung empfehlen; bei anhaltenden oder ungewöhnlichen Beschwerden medizinisch abklären.',
  avoidHard:true,preferRest:true
 }
 if(f.rpe>=9||f.legs==='destroyed')return {
  level:'high',title:'Sehr fordernde Einheit',
  message:'Du hast die Einheit als sehr hart empfunden. Erholung hat vor dem nächsten Trainingsreiz Vorrang. Keine ausgefallenen Kilometer nachholen.',
  avoidHard:true,preferRest:true
 }
 if(f.rpe>=7||f.legs==='heavy'||f.feel==='harder'||f.symptoms==='light')return {
  level:'caution',title:'Spürbar anstrengender als geplant',
  message:'Das Training hat dich merklich belastet. Für den Folgetag lieber locker planen und bei schweren Beinen die Dauer kürzen.',
  avoidHard:true,preferRest:false
 }
 return {
  level:'ok',title:'Einheit gut vertragen',
  message:'Dein Feedback spricht für eine kontrollierte Belastung. Der Coach berücksichtigt trotzdem Schlaf, Garmin-Daten und den Trainingsplan.',
  avoidHard:false,preferRest:false
 }
}
export function latestWorkoutFeedback(feedback,today){
 if(!Array.isArray(feedback)||typeof today!=='string')return null
 const floor=new Date(Date.parse(today+'T12:00:00Z')-2*86400000).toISOString().slice(0,10)
 return [...feedback].filter(f=>f&&typeof f.activityDate==='string'&&
  f.activityDate>=floor&&f.activityDate<=today&&
  typeof f.reportedOn==='string'&&f.reportedOn<=today&&
  Number.isInteger(f.rpe)&&f.rpe>=1&&f.rpe<=10)
  .sort((a,b)=>b.activityDate.localeCompare(a.activityDate)||
   b.reportedOn.localeCompare(a.reportedOn))[0]||null
}
