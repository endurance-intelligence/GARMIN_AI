/** Pure read-only model for the live Coach decision spotlight.
 * Uses exactly the same verified seven-day plan as Calendar and CoachSevenDay.
 * No simulated interval replacements, artificial readiness scores or write actions.
 */
export function selectCoachDecision(plan,context={}){
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
 const date=candidate.date,weekday=new Date(date+'T12:00:00Z').getUTCDay()||7
 const option=(context.options||[]).find(o=>o.enabled!==false&&o.weekday===weekday)
 const choice=option?(context.choices||[]).find(c=>c.training_date===date&&c.option_code===option.code)?.choice||'open':null
 const current=existing?candidate.title:
  choice==='selected'?(option?.title||'Gruppentraining')+' · zugesagt':
  choice==='skipped'?(option?.title||'Gruppentraining')+' · ausgelassen':
  option?(option.title||'Gruppentraining')+' · optional':'Kein Training eingetragen'
 const state=actionable?'review':existing?'calendar':candidate.kind==='completed'?'completed':'no-write'
 const summary=actionable?'Vorschlag, noch nicht im Kalender':
  existing?'Bereits im Kalender – keine neue Einheit':
  candidate.kind==='race'?'Wettkampftag – keine zusätzliche Einheit':
  candidate.kind==='illness'?'Kein Training während Beschwerden':
  'Einordnung · keine automatische Planänderung'
 const last=context.lastRun||null
 const review=context.review||null
 const intervals=context.intervals||null
 const distance=Number(last?.distance_m)
 const name=String(last?.activity_name||'Lauf')
 const day=String(last?.start_time_local||'').slice(0,10)
 const load=Number(intervals?.activity?.load)
 const hasLoad=intervals?.activity?.load!==null&&intervals?.activity?.load!==undefined&&Number.isFinite(load)
 const runTitle=last?'Letzte Laufeinheit · '+day:'Letzte Laufeinheit'
 const runText=last?
  name+(Number.isFinite(distance)?' · '+(distance/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km':'')+
  (review?.positive?' · '+review.positive:' · FIT-Bewertung noch nicht verfügbar.')+
  (review?.attention?' '+review.attention:'')+
  (hasLoad?' · Intervals Load '+Math.round(load)+' Punkte (Belastung, keine Note).':'')
  :'In der aktuellen Garmin-Wochenübersicht ist kein auswertbarer Lauf vorhanden.'
 const causes=[
  {key:'training',title:'Trainingsumfang',text:training},
  {key:'run',title:runTitle,text:runText},
  {key:'recovery',title:'Erholung als Verlauf',text:hrv+' · '+pulse+' · '+sleep},
  {key:'goal',title:'Dein Hauptziel',text:race}
 ]
 return {day:candidate,headline,summary,current,proposal,state,actionable,
  reason:candidate.reason||'Keine konkrete Begründung im Coach-Datensatz.',
  causes,flags:Array.isArray(plan.signals)?plan.signals:[],attentionText:plan.attentionText||''}
}
