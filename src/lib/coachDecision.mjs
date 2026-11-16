/** Pure read-only model for the live Coach decision spotlight.
 * Uses exactly the same verified seven-day plan as Calendar and CoachSevenDay.
 * No simulated interval replacements, artificial readiness scores or write actions.
 */
export function selectCoachDecision(plan){
 if(!plan||!Array.isArray(plan.days)||plan.days.length===0)return null
 const today=plan.today
 const candidate=plan.days.find(d=>d.date>=today&&d.kind!=='completed')||
  plan.days.find(d=>d.date>=today)||plan.days[0]
 if(!candidate)return null
 const source=Array.isArray(plan.flags)?plan.flags:[]
 const training=source.find(x=>x.startsWith('Garmin:'))||'Garmin-Trainingsumfang nicht verfügbar'
 const hrv=source.find(x=>x.startsWith('HRV '))||'HRV: kein ausreichender Vergleich'
 const pulse=source.find(x=>x.startsWith('Ruhepuls '))||'Ruhepuls: kein ausreichender Vergleich'
 const sleep=source.find(x=>x.startsWith('Schlaf '))||'Schlaf: kein ausreichender Vergleich'
 const race=source.find(x=>x.startsWith('Wettkampfziel '))||'Kein bestätigtes Wettkampfziel'
 const labels={
  illness:'Pause hat Vorrang.',blocked:'Dieser Tag gehört dir.',recovery:'Frische bewahren.',
  return_easy:'Behutsam zurück.',easy:'Ruhig trainieren.',long:'Ausdauer mit Maß.',
  race:'Heute zählt das Rennen.',existing:'Bereits eingeplant.',
  completed:'Bereits absolviert.',option:'Deine freie Entscheidung.',chosen:'Teilnahme ausgewählt.',
  mobility:'Stabil bleiben.'
 }
 const headline=labels[candidate.kind]||'Deine nächste Entscheidung.'
 const actionable=candidate.approvable===true
 const existing=candidate.kind==='existing'
 const proposal=actionable?candidate.title:
  candidate.title
 const current=existing?candidate.title:'Kein zusätzlicher Coach-Entwurf'
 const state=actionable?'review':existing?'calendar':candidate.kind==='completed'?'completed':'no-write'
 const summary=actionable?'Vorschlag, noch nicht im Kalender':
  existing?'Bereits im Kalender – keine neue Einheit':
  candidate.kind==='race'?'Wettkampftag – keine zusätzliche Einheit':
  candidate.kind==='illness'?'Kein Training während Beschwerden':
  'Einordnung · keine automatische Planänderung'
 const causes=[
  {key:'training',title:'Deine Trainingsbelastung',text:training},
  {key:'recovery',title:'Erholung als Verlauf',text:hrv+' · '+pulse+' · '+sleep},
  {key:'goal',title:'Dein Hauptziel',text:race}
 ]
 return {day:candidate,headline,summary,current,proposal,state,actionable,
  reason:candidate.reason||'Keine konkrete Begründung im Coach-Datensatz.',
  causes,flags:Array.isArray(plan.signals)?plan.signals:[],attentionText:plan.attentionText||''}
}
