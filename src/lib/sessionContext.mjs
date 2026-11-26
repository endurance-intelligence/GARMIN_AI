import {normalizeGarminRpe} from './garminPerception.mjs'
const num=x=>typeof x==='number'&&Number.isFinite(x)
const run=x=>/run|jog|trail|treadmill/i.test(x?.sport||'')
export function buildSessionContext(activity,list=[],terrain=[],felt=null,match=null){
 const rpe=normalizeGarminRpe(activity?.rpeRaw)
 const minutes=num(activity?.durationS)&&activity.durationS>0?Math.round(activity.durationS/60):null
 const pace=num(activity?.distanceM)&&activity.distanceM>0&&num(activity?.durationS)&&activity.durationS>0?Math.round(activity.durationS*1000/activity.distanceM):null
 const hr=num(activity?.avgHr)&&activity.avgHr>0?Math.round(activity.avgHr):null
 const day=String(activity?.date||'').slice(0,10)
 const ms=Date.parse(day+'T12:00:00Z')
 const prior=list.filter(x=>String(x.id)!==String(activity?.id)&&run(x)&&String(x.date||'')<String(activity?.date||''))
 const ultra=prior.filter(x=>num(x.distanceM)&&x.distanceM>=42195&&
  Number.isFinite(ms)&&ms-Date.parse(String(x.date).slice(0,10)+'T12:00:00Z')<=14*86400000)
  .sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]
 const days=ultra?Math.round((ms-Date.parse(String(ultra.date).slice(0,10)+'T12:00:00Z'))/86400000):null
 const first=!!ultra&&!prior.some(x=>String(x.date)>String(ultra.date))
 const validTerrain=terrain.filter(x=>num(x?.gradePct)&&num(x?.startDistanceM)&&num(x?.endDistanceM)&&x.endDistanceM>x.startDistanceM)
 const covered=validTerrain.reduce((s,x)=>s+x.endDistanceM-x.startDistanceM,0)
 const uphill=validTerrain.filter(x=>x.gradePct>=3).reduce((s,x)=>s+x.endDistanceM-x.startDistanceM,0)
 const downhill=validTerrain.filter(x=>x.gradePct<=-3).reduce((s,x)=>s+x.endDistanceM-x.startDistanceM,0)
 const hilly=covered>0&&(uphill+downhill)>0
 const low=rpe!==null&&rpe<=3
 const hard=rpe!==null&&rpe>=7
 const longReturn=!!ultra&&minutes!==null&&minutes>30&&days<=7
 const matched=match?.status==='matched'&&match.plan?.activityId===activity?.id?match.plan:null
 const delta=matched&&num(matched.durationDeltaMinutes)?matched.durationDeltaMinutes:null
 const overlong=delta!==null&&delta>=10&&delta>=matched.plannedMinutes*.2
 const withinPlan=delta!==null&&Math.abs(delta)<=5
 const verdict=overlong?'Deutlich länger als das freigegebene Coach-Training':hard?'Hohe subjektive Belastung – genauer hinschauen':longReturn?
  (low?'Gutes Belastungsgefühl, Wiedereinstieg aber eher lang':'Wiedereinstieg mit zusätzlichem Erholungsbedarf'):
  low?'Subjektiv locker – ein positives Signal':rpe===null?'Bewertung noch eingeschränkt':'Belastung anhand deiner Rückmeldung einordnen'
 const mood=longReturn||overlong?'firm':hard?'reflective':low&&withinPlan?'celebrate':low?'supportive':'focused'
 const assessment=longReturn||overlong?'BELASTUNG ZU HOCH GEWÄHLT':hard?'BELASTUNG PRÜFEN':low&&withinPlan?'DAUER IM PLAN · LOCKERES GEFÜHL':low?'POSITIVES BELASTUNGSGEFÜHL':'EINORDNUNG'
 const message=overlong?'Du bist '+delta+' Minuten länger gelaufen als vorgesehen. '+(low?'Dass es sich locker anfühlte, ist positiv. ':'')+'Trotzdem ist die zusätzliche Belastung relevant.':longReturn?'Dein Belastungsgefühl '+(low?'war gut, aber ':'allein reicht nicht zur Entwarnung: ')+'ich hätte in dieser frühen Erholungsphase einen kürzeren Wiedereinstieg bevorzugt. '+(first?'Das war dein erster erfasster Lauf nach der langen Einheit. ':'')+'Die Dauer zählt auch dann, wenn sich das Tempo locker anfühlt.':hard?'Deine eigene Garmin-Rückmeldung zeigt eine hohe Anstrengung. Ich würde die nächste Belastung davon abhängig machen, wie du dich erholst.':low?'Deine Rückmeldung spricht für eine subjektiv lockere Einheit. Ob sie auch physiologisch zum Ziel passte, hängt von den Messwerten und dem Trainingskontext ab.':'Für eine klare Qualitätsbewertung brauche ich den Trainingskontext und die verfügbaren Messwerte.'
 const planNote=matched&&delta!==null?'Gespeichertes Coach-Training: '+matched.plannedMinutes+' Min. · tatsächlich '+matched.actualMinutes+' Min. ('+(delta>0?'+':'')+delta+' Min.). Plausibel zugeordnet.':longReturn?'Rückblickende Bewertung anhand der gemessenen Vorbelastung; die damalige Coach-Empfehlung ist nicht als vollständiger Verlauf gespeichert.':null
 const weather=typeof felt==='object'&&felt!==null?felt:null
 const apparent=weather?.felt??felt
 const factors=[
  {label:'Belastungsgefühl',text:rpe===null?'Garmin-RPE fehlt.':rpe+'/10 – '+(low?'subjektiv locker.':hard?'subjektiv anstrengend.':'mittlere subjektive Belastung.')},
  {label:'Herzfrequenz',text:hr===null?'Keine durchschnittliche HF verfügbar.':'Ø '+hr+' bpm. Allein kein Nachweis für Zone 2 oder vollständige Erholung; persönliche Zonen und Verlauf beachten.'},
  {label:'Tempo',text:pace===null?'Keine belastbare Pace.':Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0')+' min/km aus Dauer und Distanz; Tempo allein ist keine Qualitätsnote.'},
  {label:'Dauer',text:minutes===null?'Dauer fehlt.':minutes+' Minuten.'+(longReturn?' Für die erste Woche nach einer sehr langen Einheit ein eher langer Belastungsreiz.':'')},
  {label:'Wettkampf / Vorbelastung',text:ultra?(first?'Erster erfasster Lauf':'Erfasster Lauf')+' '+days+' Tage nach '+(ultra.distanceM/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km. Tatsächlich gelaufene Distanz, nicht geplante Renndistanz.':'Keine vorausgehende Marathon-/Ultradistanz im geladenen 14-Tage-Verlauf erkannt.'},
  {label:'Streckenprofil',text:covered?('FIT-Geländedaten über '+(covered/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km; '+Math.round(uphill)+' m Streckenlänge bergauf und '+Math.round(downhill)+' m bergab (ab 3 %). '+(hilly?'Pace und HF nicht ungeprüft mit flachen Läufen vergleichen; bergab zusätzliche muskuläre Belastung.':'Keine Steigungsabschnitte ab 3 % in den vorhandenen Fenstern.')):'Keine auswertbaren FIT-Geländefenster; Höhenprofil nicht bewertet.'},
  {label:'Wetter / gefühlte Temperatur',text:num(apparent)?(weather?'Open-Meteo · historisches Wettermodell am zugeordneten Gruppentermin '+weather.location+' · '+weather.hour+' Uhr: '+weather.temperature+' °C, gefühlt ':'Deine Angabe: ')+apparent.toLocaleString('de-DE')+' °C'+(weather?'':' gefühlt')+'. '+(apparent<=0?'Kälte als Kontext berücksichtigen; keine pauschale Pace- oder Pulskorrektur.':'Keine pauschale Pace- oder Pulskorrektur.'):'Keine verifizierten historischen Wetterdaten für Ort und Laufzeit; Wetter nicht bewertet.'}
 ]
 const next=ultra?'Morgen auf Fußbeschwerden, Muskelgefühl und ungewöhnliche Müdigkeit achten. Kein Nachholen oder hartes Training; nur schmerzfreie leichte Bewegung nach Wohlbefinden.':hard?'Erholung priorisieren und vor dem nächsten intensiven Training die Verträglichkeit prüfen.':'Training nach Wohlbefinden und tatsächlichem Plan fortsetzen; bei Beschwerden Belastung reduzieren.'
 return {verdict,mood,assessment,message,planNote,factors,next}
}
