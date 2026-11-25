/** Goal-dependent priorities; never infer terrain from race title or manufacture fitness data.
 * Phase targets are coaching heuristics, not validated individual prescriptions.
 * Complementary sessions are optional alternatives, not extra training or automatic calendar writes.
 */
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const monday=d=>add(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const offset=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)
export function exactGoalRoute(goal,records){
 if(!goal||!validDate(goal.race_date)||typeof goal.race_name!=='string'||!Array.isArray(records))return null
 const matches=records.filter(r=>r?.event_title===goal.race_name&&r.race_date===goal.race_date&&finite(r.details?.ascentM)&&r.details.ascentM>=0&&r.details.ascentM<=30000)
 if(matches.length!==1)return null
 return {raceName:goal.race_name,raceDate:goal.race_date,ascentM:matches[0].details.ascentM}
}
export function buildGoalProfile({today,goal,route}={}){
 const target=goal?.goal||null
 const upcoming=validDate(today)&&validDate(target?.race_date)&&target.race_date>=today
 const maintenance=!upcoming&&finite(target?.maintenance_weekly_km)&&target.maintenance_weekly_km>0
 const km=upcoming&&finite(target.distance_km)&&target.distance_km>0?target.distance_km:null
 const ascent=upcoming&&route?.raceName===target.race_name&&route?.raceDate===target.race_date&&finite(route.ascentM)&&route.ascentM>=0?route.ascentM:null
 const density=km!==null&&ascent!==null?Math.round(ascent/km*10)/10:null
 const kind=km===null?(maintenance?'maintenance':'unknown'):km<=10?'short':km<=22?'half':km<=42.195?'marathon':'ultra'
 const labels={short:'Kurze Laufdistanz',half:'Mittlere Laufdistanz / Halbmarathon',marathon:'Lange Laufdistanz / Marathon',ultra:'Ultra-Ausdauer',maintenance:'Fitness erhalten',unknown:'Zielprofil noch offen'}
 // 15 m/km is a transparent product heuristic, NOT a universal trail classification.
 const hills=density!==null&&density>=15
 const requirements={
 short:['Laufökonomie','Gezielte schnelle Reize','Aerobe Basis'],
 half:['Aerobe Basis','Tempohärte','Laufökonomie'],
 marathon:['Ermüdungsresistenz','Lange lockere Läufe','Verpflegung und Renntempo'],
 ultra:['Zeit auf den Beinen','Lauf-/Gehstrategie','Ermüdungsresistenz und Versorgung'],
 maintenance:['Konstanz','Aerobe Basis','Kraft erhalten'],
 unknown:['Ziel und Distanz festlegen']
 }
 return {kind,label:labels[kind],km,ascentM:ascent,ascentPerKm:density,hills,
  daysUntil:upcoming?offset(today,target.race_date):null,
  name:upcoming?target.race_name:null,
  requirements:[...requirements[kind],...(hills?['Bergauf-Ausdauer und kontrollierte Bergabbelastung']:[])],
  terrainNote:ascent===null?'Höhenprofil nicht bekannt – keine Annahme über Gelände.':hills?'Höhenmeter sind als eigener Trainingsschwerpunkt berücksichtigt.':'Höhenmeter bekannt; Gelände und technische Schwierigkeit daraus nicht ableitbar.'}
}
export function goalPhaseFocus(profile,phase,{deload=false,hasBase=true}={}){
 if(['paused','recovery','race'].includes(phase))return {title:'Erholung hat Vorrang',focus:'Kein zusätzlicher Aufbau in dieser Phase.',complement:'Kein verpflichtendes Zusatztraining.'}
 if(phase==='taper')return {title:'Frische erhalten',focus:'Bekannte Reize verkürzen und Belastung reduzieren.',complement:'Keine neuen oder ermüdenden Kraft- und Zusatztrainings.'}
 if(deload)return {title:'Reize verarbeiten',focus:'Ermüdung abbauen; kein Nachholen von Umfang.',complement:'Nur gewohnte, leichte Bewegung oder Mobility nach Bedarf.'}
 if(profile.kind==='unknown')return {title:'Ziel klären',focus:'Erst ein konkretes Ziel oder Trainingsniveau festlegen.',complement:'Keine zusätzlichen Belastungsziele aus fehlenden Daten.'}
 const early=phase==='base'||phase==='build'
 const title=early?'Belastbarkeit aufbauen':phase==='peak'?'Spezifische Reize sichern':'Zielspezifisch trainieren'
 const focus={
  short:early?'Aerobe Basis, Lauftechnik und Kraft.':'Ökonomisches Laufen und gezielte kurze schnelle Reize im Rahmen des Coach-Plans.',
  half:early?'Lockere Ausdauer und Kraftbasis.':'Längere kontrollierte Läufe und gezielte wettkampfspezifische Reize.',
  marathon:early?'Regelmäßige lockere Läufe und robuste Beine.':'Ermüdungsresistenz, Verpflegung und verträgliche längere Läufe.',
  ultra:early?'Lockere Ausdauer, Zeit auf den Beinen und stabile Muskulatur.':'Lauf-/Gehstrategie, Verpflegung und verträgliche lange Belastung statt Extremumfänge.',
  maintenance:'Regelmäßig trainieren, Belastung und Erholung im Gleichgewicht halten.'
 }[profile.kind]
 const complement=early?'Körpergewicht-Kraft und Stabi aufbauen; bei Bedarf bekannte lockere Ausdaueralternativen.':'Gewohnte Kraftreize erhalten, Laufqualität nicht durch Zusatzbelastung beeinträchtigen.'
 return {title,focus:focus+(profile.hills?' Gezielte Anstiege bzw. Power Hiking einbeziehen, Bergabbelastung langsam gewöhnen.':''),complement:!hasBase?'Erst vollständige Belastungsdaten prüfen. Noch keine konkrete Zusatzdauer.':complement}
}
function activityKind(s){
 s=String(s||'').toLowerCase()
 if(/strength|weight|stabi/.test(s))return 'strength'
 if(/mobility|yoga|pilates/.test(s))return 'mobility'
 if(/rowing/.test(s))return 'rowing'
 if(/cycling|biking/.test(s))return 'cycling'
 if(/soccer|football/.test(s))return 'football'
 if(/running|trail_run|treadmill/.test(s))return 'running'
 return 'other'
}
export function crossTrainingEvidence({today,boards}={}){
 if(!validDate(today)||!Array.isArray(boards))return {complete:false,strengthDays:null,rowingDays:null,cyclingDays:null,footballDays:null,minutes:null,recentHard:false,rows:[]}
 const begin=add(today,-6),weeks=new Set([monday(begin),monday(today)])
 const complete=[...weeks].every(w=>boards.some(b=>b?.start===w&&Array.isArray(b.activities)&&Array.isArray(b.manual)))
 const recent=add(today,-27),seen=new Set(),rows=[]
 for(const b of boards){
  for(const a of Array.isArray(b?.activities)?b.activities:[]){
   const date=String(a.start_time_local||'').slice(0,10),kind=activityKind(a.sport_type)
   if(!validDate(date)||date<recent||date>today||a.activity_id==null||!finite(a.duration_s)||a.duration_s<=0)continue
   const key='g:'+a.activity_id
   if(seen.has(key))continue
   seen.add(key)
   const raw=a.rpe_raw
   const rpe=finite(raw)?(raw>10?raw/10:raw):null
   rows.push({date,kind,minutes:a.duration_s/60,rpe,source:'Garmin'})
  }
 }
 for(const b of boards){
  for(const a of Array.isArray(b?.manual)?b.manual:[]){
   const date=a.session_date,kind=activityKind(a.kind),key='m:'+a.id
   if(!validDate(date)||date<recent||date>today||a.id==null||seen.has(key)||!finite(a.duration_minutes)||a.duration_minutes<=0)continue
   seen.add(key)
   if(rows.some(r=>r.source==='Garmin'&&r.date===date&&r.kind===kind))continue
   rows.push({date,kind,minutes:a.duration_minutes,rpe:finite(a.rpe)?a.rpe:null,source:'Manuell'})
  }
 }
 const seven=rows.filter(r=>r.date>=begin)
 const count=kind=>complete?new Set(seven.filter(r=>r.kind===kind).map(r=>r.date)).size:null
 const recentHard=seven.some(r=>r.date>=add(today,-1)&&(r.kind==='football'||(r.rpe!==null&&r.rpe>=8)))
 return {complete,strengthDays:count('strength'),rowingDays:count('rowing'),cyclingDays:count('cycling'),footballDays:count('football'),minutes:complete?Math.round(seven.reduce((s,r)=>s+r.minutes,0)):null,recentHard,rows}
}
export function buildGoalSupplement({today,profile,days,boards,protectedPhase,qualityDay}={}){
 const evidence=crossTrainingEvidence({today,boards})
 const none=(reason)=>({suggestion:null,evidence,reason})
 if(!validDate(today)||!profile||!Array.isArray(days)||profile.kind==='unknown')return none('Konkretes Ziel oder Trainingsniveau fehlt.')
 if(protectedPhase||profile.daysUntil!==null&&profile.daysUntil<=10||evidence.recentHard)return none('Erholung und bestehende Belastung haben Vorrang.')
 if(!evidence.complete)return none('Ergänzende Aktivitäten der letzten sieben Tage nicht vollständig geladen.')
 const open=d=>d.date>=today&&d.date<=add(today,6)&&d.approvable&&!d.decision&&!d.selectedGroup&&finite(d.minutes)&&d.minutes>=15
 // Do not introduce new strength immediately before a possible hard day, or a confirmed/scheduled group.
 const nextDemanding=d=>days.some(x=>x.date===add(d.date,1)&&(x.date===qualityDay||x.kind==='race'||x.kind==='existing'||!!x.selectedGroup||x.intensityIntent==='hard-option'||x.kind==='long'))
 const slot=days.find(d=>open(d)&&d.kind==='mobility'&&!nextDemanding(d))
 if(evidence.strengthDays===0&&slot){
  const emphasis=profile.hills?'Waden, Hüfte, Gesäß und einbeinige Stabilität':profile.kind==='short'?'Waden, Hüftstreckung und Rumpfstabilität':'Rumpf, Hüfte und Beinachsenstabilität'
  return {evidence,reason:'Noch kein Krafttraining in den geladenen letzten sieben Tagen.',suggestion:{date:slot.date,kind:'strength',title:'Gezieltes Stabi & Krafttraining',minutes:slot.minutes,intensity:'Leicht bis moderat, keine Ausbelastung',reason:emphasis+' passend zum Ziel. Bestehenden Stabi-/Mobility-Vorschlag nutzen, nicht zusätzlich trainieren.',mode:'existing-slot'}}
 }
 // Offer an aerobic alternative only if that sport was actually recorded recently,
 // at least three actual running days in the last seven days are evidenced,
 // and the currently proposed easy session is not adjacent to a demanding planned day.
 const begin=add(today,-6),runDays=new Set(evidence.rows.filter(r=>r.kind==='running'&&r.date>=begin).map(r=>r.date)).size
 const lowImpact=['rowing','cycling'].find(k=>evidence.rows.some(r=>r.kind===k&&r.minutes>=10)&&evidence[k==='rowing'?'rowingDays':'cyclingDays']===0)
 const easy=days.find(d=>open(d)&&d.kind==='easy'&&d.intensityIntent==='low'&&!nextDemanding(d))
 if(lowImpact&&runDays>=3&&easy&&['base','build'].includes(profile.daysUntil===null||profile.daysUntil>98?'base':profile.daysUntil>56?'build':'specific')){
  return {evidence,reason:'Bekannte alternative Ausdauerform, mindestens drei beobachtete Lauftage.',suggestion:{date:easy.date,kind:lowImpact,title:lowImpact==='rowing'?'Lockeres Rudern als Alternative':'Lockeres Radfahren als Alternative',minutes:Math.min(30,easy.minutes),intensity:'Locker · Sprechtempo',reason:'Nur statt des offenen lockeren Laufs, um laufbedingte Stoßbelastung zu reduzieren. Kein Laufkilometer-Ersatz und keine neue Pflicht.',mode:'alternative'}}
 }
 return none('Keine passende zusätzliche Option ohne Konflikt mit dem bestehenden Plan. Kein Training erzwingen.')
}
