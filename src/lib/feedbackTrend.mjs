/** 14/28-day athlete feedback trend; no made-up values or automatic plan writes. */
const dayPattern=/^\d{4}-\d{2}-\d{2}$/
const daysBefore=(day,count)=>new Date(Date.parse(day+'T12:00:00Z')-
 count*86400000).toISOString().slice(0,10)
export function analyzeWorkoutFeedbackTrend(feedback,today){
 const empty={level:'insufficient',count14:0,count28:0,highRpe14:0,heavyLegs14:0,
  lightSymptoms14:0,clearSymptoms14:0,harder14:0,averageRpe14:null,
  title:'Dein Feedback-Verlauf',summary:'Nach drei Rückmeldungen kann der Coach Muster erkennen.',
  suggestion:'Bisher keine belastbare Anpassung aus mehreren Einheiten.',kind:'none',evidence:[]}
 if(!Array.isArray(feedback)||!dayPattern.test(String(today)))return empty
 const cutoff28=daysBefore(today,27),cutoff14=daysBefore(today,13)
 // An athlete can update a session; use only their latest review for that activity.
 const entries=new Map()
 for(const f of feedback){
  if(!f||typeof f.activityId!=='string'||!f.activityId||
    typeof f.activityDate!=='string'||!dayPattern.test(f.activityDate)||
    f.activityDate>today||f.activityDate<cutoff28||
    typeof f.reportedOn!=='string'||!dayPattern.test(f.reportedOn)||f.reportedOn>today||
    !Number.isInteger(f.rpe)||f.rpe<1||f.rpe>10||
    !['fresh','ok','tired','heavy','destroyed'].includes(f.legs)||
    !['none','light','clear'].includes(f.symptoms)||
    !['easier','as_expected','harder'].includes(f.feel))continue
  const previous=entries.get(f.activityId)
  if(!previous||f.reportedOn>=previous.reportedOn)entries.set(f.activityId,f)
 }
 const recent=[...entries.values()].sort((a,b)=>
  b.activityDate.localeCompare(a.activityDate)||b.reportedOn.localeCompare(a.reportedOn))
 const last14=recent.filter(f=>f.activityDate>=cutoff14)
 const last5=last14.slice(0,5)
 const count28=recent.length,count14=last14.length
 const highRpe14=last14.filter(f=>f.rpe>=8).length
 const heavyLegs14=last14.filter(f=>['heavy','destroyed'].includes(f.legs)).length
 const lightSymptoms14=last14.filter(f=>f.symptoms==='light').length
 const clearSymptoms14=last14.filter(f=>f.symptoms==='clear').length
 const harder14=last14.filter(f=>f.feel==='harder').length
 const averageRpe14=count14?Math.round(last14.reduce((sum,f)=>sum+f.rpe,0)/count14*10)/10:null
 const base={...empty,count14,count28,highRpe14,heavyLegs14,
  lightSymptoms14,clearSymptoms14,harder14,averageRpe14}
 if(count14<3)return {...base,summary:count14===0?
  'Noch kein Trainingsfeedback aus den letzten 14 Tagen.':
  count14+' von 3 Rückmeldungen vorhanden – für einen Verlauf brauchen wir noch mehr Einheiten.'}
 const mostRecent=last14[0]
 const recent7Cutoff=daysBefore(today,6)
 const hasRecent=last14.some(f=>f.activityDate>=recent7Cutoff)
 const highRecently=last5.filter(f=>f.rpe>=8).length>=3
 const heavyRecently=last5.filter(f=>['heavy','destroyed'].includes(f.legs)).length>=2
 const clearRecently=last14.some(f=>f.symptoms==='clear'&&f.activityDate>=recent7Cutoff)
 const lightRepeated=last14.filter(f=>f.symptoms==='light').length>=2
 const high=hasRecent&&(clearRecently||highRecently||heavyRecently)
 const caution=hasRecent&&(lightRepeated||last5.filter(f=>f.feel==='harder').length>=2||
   last5.filter(f=>f.rpe>=7).length>=3)
 const steady=count14>=4&&last14.slice(0,6).every(f=>
  f.rpe<=6&&['fresh','ok'].includes(f.legs)&&f.symptoms==='none'&&f.feel!=='harder')
 const evidence=[
  highRpe14+' von '+count14+' Einheiten mit Anstrengung 8–10/10',
  heavyLegs14+' × schwere Beine',
  clearSymptoms14+lightSymptoms14+' × Beschwerden',
  harder14+' × härter als erwartet'
 ]
 if(high)return {...base,level:'high',kind:'reduce',title:'Zuletzt viel Belastung',
  summary:clearRecently?'Du hast zuletzt deutliche Beschwerden gemeldet.':
   heavyRecently?'Deine Beine waren nach mehreren Einheiten schwer.':
    'Mehrere Einheiten waren zuletzt sehr anstrengend.',
  suggestion:'Die nächsten lockeren Läufe kürzen und harte Reize auslassen. Keine Kilometer nachholen.',
  evidence}
 if(caution)return {...base,level:'caution',kind:'shorten',title:'Etwas vorsichtiger planen',
  summary:lightRepeated?'Du hast wiederholt leichte Beschwerden gemeldet.':
    'Mehrere Einheiten waren anstrengender als gedacht.',
  suggestion:'Den nächsten langen Lauf kürzen und lockere Einheiten wirklich locker halten.',
  evidence}
 if(steady)return {...base,level:'stable',kind:'maintain',title:'Training zuletzt gut vertragen',
  summary:'Deine letzten Rückmeldungen waren überwiegend unauffällig.',
  suggestion:'Am normalen Plan festhalten. Nicht wegen guter Zahlen schneller steigern.',
  evidence}
 return {...base,level:'neutral',kind:'maintain',title:'Gemischte Rückmeldungen',
  summary:'Deine Einheiten haben sich unterschiedlich angefühlt.',
  suggestion:'Training wie geplant prüfen; Schlaf, Beschwerden und Tagesform weiter beachten.',
  evidence}
}
