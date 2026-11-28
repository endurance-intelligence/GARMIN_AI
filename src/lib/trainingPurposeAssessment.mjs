/**
 * Purpose-first coaching. Separate the intended session, measured effort,
 * reference-zone uncertainty and next action. No inferred LT1 or plan match.
 * Only the already-conservative matched plan may establish planned intent.
 */
const finite=x=>typeof x==='number'&&Number.isFinite(x)
const validHr=x=>finite(x)&&x>=35&&x<=220
const lowKinds=new Set(['easy','return_easy','long','recovery'])
const qualityKinds=new Set(['intervals','threshold','tempo','vo2max','hill_intervals','quality'])
const clock=x=>Math.floor(Math.round(x)/60)+':'+String(Math.round(x)%60).padStart(2,'0')
const fmt=x=>Math.round(x).toLocaleString('de-DE')
/** Approximate elapsed-time weighting from valid adjacent timestamps.
 * Large recording gaps, missing HR, duplicate or unordered timestamps never
 * get assigned to a zone. Coverage must be sufficient before interpreting.
 */
export function measuredHrExposure(samples,upperBpm){
 if(!Array.isArray(samples)||samples.length<80||!finite(upperBpm)||upperBpm<40||upperBpm>220)return null
 const pairs=[]
 const times=samples.map(s=>s?.elapsed).filter(finite)
 if(times.length<80||times.some((t,i)=>i>0&&t<times[i-1]))return null
 for(let i=0;i<samples.length-1;i++){
  const a=samples[i],b=samples[i+1]
  if(!finite(a?.elapsed)||!finite(b?.elapsed))continue
  const dt=b.elapsed-a.elapsed
  if(dt>0)pairs.push({dt,a,b})
 }
 const deltas=pairs.map(x=>x.dt).sort((a,b)=>a-b)
 if(!deltas.length)return null
 const cap=Math.min(30,Math.max(2,deltas[Math.floor(deltas.length/2)]*3))
 const span=times.at(-1)-times[0]
 if(span<300)return null
 let valid=0,above=0,validPairs=0
 for(const {a,b,dt} of pairs){
  if(dt>cap||!validHr(a.hr)||!validHr(b.hr))continue
  valid+=dt;validPairs++
  // Trapezoid weighting of adjacent observations, not exact zone seconds.
  above+=dt*((Number(a.hr>upperBpm)+Number(b.hr>upperBpm))/2)
 }
 if(validPairs<79||valid/span<.75)return null
 return {aboveShare:100*above/valid,aboveSeconds:above,validSeconds:valid,coverage:valid/span,upperBpm}
}
const result=(kind,verdict,mode,recommendation,next,evidence=[])=>({
 kind,verdict,mode,mood:mode==='caution'?'firm':mode==='positive'?'supportive':'focused',
 modeLabel:mode==='caution'?'Trainingsziel prüfen':mode==='positive'?'Passender Trainingsreiz':'Ausführung einordnen',
 recommendation,next,evidence
})
export function assessTrainingPurpose({activity,match,review,samples=[],zoneReference,rpe}={}){
 const planned=match?.status==='matched'?match.plan:null
 const kind=String(planned?.coachKind||'')
 const matchingReview=review?.activityId===activity?.id?review:null
 const isInterval=qualityKinds.has(kind)||matchingReview?.type==='intervals'||
  /intervall|interval|bahn|track|wiederholung/i.test(String(activity?.name||''))||
  activity?.sport==='track_running'
 if(lowKinds.has(kind)){
  const label=kind==='long'?'ruhiger Longrun':kind==='return_easy'?'lockerer Wiedereinstieg':kind==='recovery'?'Regeneration':'lockerer Grundlagenlauf'
  const ref=zoneReference?.activityId===activity?.id&&zoneReference?.source==='intervals-current'?zoneReference:null
  const exposure=ref?measuredHrExposure(samples,ref.upperBpm):null
  const evidence=[{label:'Trainingsziel',value:label,detail:'Zeitlich plausibel zugeordnete, freigegebene Coach-Vorgabe.'}]
  if(exposure)evidence.push({label:'Über aktueller Z2-Obergrenze',value:fmt(exposure.aboveShare)+' %',detail:'Ca. '+fmt(exposure.aboveSeconds/60)+' Min. aus gültigen HF-Zeitabschnitten über '+exposure.upperBpm+' bpm. Heutige Intervals-Grenzen, keine historisch bestätigte LT1 oder damals gespeicherte Ziel-HF.'})
  const excessive=exposure&&exposure.aboveShare>=40&&exposure.aboveSeconds>=600
  if(excessive||finite(rpe)&&rpe>=7){
   const why=(excessive?'Ein erheblicher Teil der gemessenen Belastung lag über deiner aktuell konfigurierten Intervals-Z2-Obergrenze. ':'')+(finite(rpe)&&rpe>=7?'Dein RPE von '+rpe+'/10 ist für diesen lockeren Auftrag hoch. ':'')+
    (excessive&&finite(rpe)&&rpe<=3?'Auch ein niedriges RPE hebt die gemessene Abweichung nicht auf. ':'')
   return result(kind,'Zu intensiv für den lockeren Auftrag.', 'caution',why+'Das spricht gegen den beabsichtigten ruhigen Trainingsreiz.','Die zusätzliche Belastung berücksichtigen. Vor der nächsten Qualitätseinheit Erholung und aktuelle Belastbarkeit prüfen; keine Intensität nachholen.',evidence)
  }
  if(exposure&&exposure.aboveShare<=10&&finite(rpe)&&rpe<=3)return result(kind,'Der lockere Trainingsreiz passt.', 'positive','Die gemessene HF lag überwiegend in oder unter den aktuell konfigurierten ersten beiden Intervals-Zonen. Dein Belastungsgefühl passt dazu.','Lockere Einheiten weiter bewusst locker halten. Individuelle Zielgrenzen und Erholung beachten.',evidence)
  return result(kind,'Lockeres Trainingsziel gezielt prüfen.', 'review',exposure?'Die gemessene HF-Verteilung und dein Empfinden gemeinsam einordnen. Ein exakt historisches HF-Ziel ist nicht gespeichert.':'Für eine belastbare Intensitätsprüfung fehlen ausreichend zeitlich zuordenbare HF-Daten oder persönliche Zonengrenzen.','Nicht schneller laufen, nur um ein Tempo zu erreichen. Die nächste Einheit nach geplantem Zweck und Erholung gestalten.',evidence)
 }
 if(isInterval){
  const laps=matchingReview?.quality==='fit-intervals'&&Array.isArray(matchingReview.intervals)?matchingReview.intervals.filter(l=>finite(l?.distanceM)&&l.distanceM>=200&&finite(l.paceSeconds)&&l.paceSeconds>0):[]
  const evidence=[{label:'Trainingsschwerpunkt',value:'Belastungsintervalle',detail:'Ein-/Auslaufen und Erholung werden nicht als Belastungswiederholungen bewertet.'}]
  if(laps.length<2)return result('intervals','Intervalle stehen im Fokus.', 'review','Die Belastungsabschnitte sind noch nicht eindeutig auswertbar. Gesamtpace und Gesamt-HF sind keine Intervallnote.','Belastungsabschnitte abwarten bzw. prüfen. Keine Trainingssteigerung aus unvollständigen Daten ableiten.',evidence)
  const distance=laps.reduce((sum,l)=>sum+l.distanceM,0)
  const times=laps.every(l=>finite(l.durationS)&&l.durationS>0)?laps.reduce((sum,l)=>sum+l.durationS,0):null
  evidence.push({label:'Erkannte Belastungen',value:String(laps.length),detail:fmt(distance)+' m Belastungsdistanz; ohne Trabpausen und Ein-/Auslaufen.'})
  if(times!==null)evidence.push({label:'Pace der Belastungen',value:clock(times*1000/distance)+'/km',detail:'Distanzgewichteter Wert nur der erkannten Belastungen, keine Gesamtlaufpace.'})
  const comparable=Math.max(...laps.map(l=>l.distanceM))/Math.min(...laps.map(l=>l.distanceM))<=1.1
  const first=laps[0],last=laps.at(-1)
  const observation=comparable?'Erste/letzte Belastung: '+clock(first.paceSeconds)+' / '+clock(last.paceSeconds)+' min/km.':'Unterschiedliche Intervalllängen – kein pauschales Urteil über Tempokonstanz.'
  const hf=validHr(first.avgHr)&&validHr(last.avgHr)?' HF erste/letzte Belastung: '+fmt(first.avgHr)+' → '+fmt(last.avgHr)+' bpm.':''
  return result('intervals',laps.length+' Belastungen im Fokus.', 'review',observation+hf+' Die Qualität der Tempoeinteilung hängt von der jeweiligen Sollvorgabe ab; eine eindeutige Soll-Ist-Zuordnung liegt noch nicht vor.','Die Wiederholungen mit ihren jeweiligen Zielzeiten vergleichen. Erholung, Pausen und dein Belastungsgefühl vor der nächsten intensiven Einheit beachten.',evidence)
 }
 return null
}
