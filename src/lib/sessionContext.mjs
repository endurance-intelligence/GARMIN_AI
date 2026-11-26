import {normalizeGarminRpe} from './garminPerception.mjs'
const num=x=>typeof x==='number'&&Number.isFinite(x)
const run=x=>/run|jog|trail|treadmill/i.test(x?.sport||'')
export function buildSessionContext(activity,list=[],terrain=[],felt=null){
 const rpe=normalizeGarminRpe(activity?.rpeRaw)
 const minutes=num(activity?.durationS)&&activity.durationS>0?Math.round(activity.durationS/60):null
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
 const verdict=hard?'Hohe subjektive Belastung – genauer hinschauen':longReturn?
  (low?'Gutes Belastungsgefühl, Wiedereinstieg aber eher lang':'Wiedereinstieg mit zusätzlichem Erholungsbedarf'):
  low?'Subjektiv locker – ein positives Signal':rpe===null?'Bewertung noch eingeschränkt':'Belastung anhand deiner Rückmeldung einordnen'
 const mood=hard||longReturn?'reflective':low?'supportive':'focused'
 const factors=[
  {label:'Belastungsgefühl',text:rpe===null?'Garmin-RPE fehlt.':rpe+'/10 – '+(low?'subjektiv locker.':hard?'subjektiv anstrengend.':'mittlere subjektive Belastung.')},
  {label:'Herzfrequenz',text:hr===null?'Keine durchschnittliche HF verfügbar.':'Ø '+hr+' bpm. Allein kein Nachweis für Zone 2 oder vollständige Erholung; persönliche Zonen und Verlauf beachten.'},
  {label:'Dauer',text:minutes===null?'Dauer fehlt.':minutes+' Minuten.'+(longReturn?' Für die erste Woche nach einer sehr langen Einheit ein eher langer Belastungsreiz.':'')},
  {label:'Wettkampf / Vorbelastung',text:ultra?(first?'Erster erfasster Lauf':'Erfasster Lauf')+' '+days+' Tage nach '+(ultra.distanceM/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km. Tatsächlich gelaufene Distanz, nicht geplante Renndistanz.':'Keine vorausgehende Marathon-/Ultradistanz im geladenen 14-Tage-Verlauf erkannt.'},
  {label:'Streckenprofil',text:covered?('FIT-Geländedaten über '+(covered/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km; '+Math.round(uphill)+' m Streckenlänge bergauf und '+Math.round(downhill)+' m bergab (ab 3 %). '+(hilly?'Pace und HF nicht ungeprüft mit flachen Läufen vergleichen; bergab zusätzliche muskuläre Belastung.':'Keine Steigungsabschnitte ab 3 % in den vorhandenen Fenstern.')):'Keine auswertbaren FIT-Geländefenster; Höhenprofil nicht bewertet.'},
  {label:'Wetter / gefühlte Temperatur',text:num(felt)?'Deine Angabe: '+felt.toLocaleString('de-DE')+' °C gefühlt. '+(felt<=0?'Kälte als Kontext berücksichtigen; keine pauschale Pace- oder Pulskorrektur.':'Keine pauschale Pace- oder Pulskorrektur.'):'Keine verifizierten historischen Wetterdaten für Ort und Laufzeit; Wetter nicht bewertet.'}
 ]
 const next=ultra?'Morgen auf Fußbeschwerden, Muskelgefühl und ungewöhnliche Müdigkeit achten. Kein Nachholen oder hartes Training; nur schmerzfreie leichte Bewegung nach Wohlbefinden.':hard?'Erholung priorisieren und vor dem nächsten intensiven Training die Verträglichkeit prüfen.':'Training nach Wohlbefinden und tatsächlichem Plan fortsetzen; bei Beschwerden Belastung reduzieren.'
 return {verdict,mood,factors,next}
}
