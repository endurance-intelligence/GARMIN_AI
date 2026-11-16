/** Pure read-only model for the live Coach decision spotlight.
 * Uses exactly the same verified seven-day plan as Calendar and CoachSevenDay.
 * No simulated interval replacements, artificial readiness scores or write actions.
 */
export function selectCoachDecision(plan,snapshot=null){
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
 const opts=Array.isArray(snapshot?.options?.options)?snapshot.options.options:[]
 const weekDay=new Date(candidate.date+'T12:00:00Z').getUTCDay()||7
 const option=opts.find(o=>o.enabled!==false&&o.weekday===weekDay)
 const choices=Array.isArray(snapshot?.options?.choices)?snapshot.options.choices:[]
 const choice=option?choices.find(c=>c.training_date===candidate.date&&c.option_code===option.code)?.choice:''
 const offered=option?String(option.title||'Gruppentermin')+
  (option.start_time?' · '+String(option.start_time).slice(0,5):'')+
  (choice==='selected'?' (zugesagt)':choice==='skipped'?' (ausgelassen)':' (optional)'):null
 const current=existing?candidate.title:offered||'Noch keine Einheit eingetragen'
 const state=actionable?'review':existing?'calendar':candidate.kind==='completed'?'completed':'no-write'
 const summary=actionable?'Vorschlag, noch nicht im Kalender':
  existing?'Bereits im Kalender – keine neue Einheit':
  candidate.kind==='race'?'Wettkampftag – keine zusätzliche Einheit':
  candidate.kind==='illness'?'Kein Training während Beschwerden':
  'Einordnung · keine automatische Planänderung'
 const last=snapshot?.recent
 const lastRun=last?.activity
 const review=last?.review
 const intervalLoad=last?.intervals
 const load=intervalLoad?.load
 const baseline=intervalLoad?.comparison
 const runDistance=lastRun?.distanceKm!=null?Number(lastRun.distanceKm).toLocaleString('de-DE')+' km':'Distanz fehlt'
 const runHr=lastRun?.averageHr!=null?' · Ø-HF '+Math.round(lastRun.averageHr)+' bpm':''
 const runFinding=lastRun?'Letzter Lauf '+lastRun.date+': '+lastRun.name+' · '+runDistance+runHr+'. '+
  (review?.positive?review.positive:'Details der Belastungsabschnitte aktuell nicht abrufbar.')+
  (review?.attention?' '+review.attention:'')+
  (load!=null?' Intervals Load '+Math.round(load)+
   (baseline?.available&&baseline.median!=null?' (bisheriger Lauf-Median '+Math.round(baseline.median)+')':'')+'.':''):
  'Keine aktuelle Laufbewertung aus der letzten Woche verfügbar.'
 const boards=Array.isArray(snapshot?.boards)?snapshot.boards:[]
 const sports=boards.flatMap(b=>Array.isArray(b.activities)?b.activities:[]).filter(a=>{
  const d=String(a.start_time_local||'').slice(0,10)
  return d>=new Date(Date.parse(plan.today+'T12:00:00Z')-6*86400000).toISOString().slice(0,10)&&d<=plan.today
 })
 const football=sports.filter(a=>/soccer|football/i.test(String(a.sport_type||''))).length
 const mobility=sports.filter(a=>/mobility|strength|pilates/i.test(String(a.sport_type||''))).length
 const otherTraining=(football||mobility)?
  ' Ergänzend zuletzt: '+(football?football+'× Fußball':'')+
  (football&&mobility?', ':'')+(mobility?mobility+'× Stabi/Kraft':'')+'.':''
 const causes=[
  {key:'training',title:'Letzter Lauf & Belastung',text:training+'. '+runFinding+otherTraining},
  {key:'recovery',title:'Erholung als Verlauf',text:hrv+' · '+pulse+' · '+sleep},
  {key:'goal',title:'Dein Hauptziel',text:race}
 ]
 return {day:candidate,headline,summary,current,proposal,state,actionable,
  reason:candidate.reason||'Keine konkrete Begründung im Coach-Datensatz.',
  causes,flags:Array.isArray(plan.signals)?plan.signals:[],attentionText:plan.attentionText||''}
}
