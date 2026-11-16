/** Human explanations of personal recovery deviations. No readiness score. */
const valid=n=>typeof n==='number'&&Number.isFinite(n)
export function recoveryMetricMeaning(row){
 if(!row||!valid(row.latest))return 'Kein aktueller Messwert – keine Einordnung.'
 if(!valid(row.median)||!valid(row.difference))return 'Noch keine ausreichenden Vergleichstage.'
 const diff=row.difference,median=row.median
 if(row.metric==='sleep_seconds'){
  const minutes=Math.round(Math.abs(diff)/60)
  return minutes<30?'Schlafdauer nahe deiner jüngsten Referenz. Die Qualität ist damit nicht bewertet.':
   diff<0?minutes+' Min. weniger Schlaf als üblich – Tagesmüdigkeit berücksichtigen.':
   minutes+' Min. mehr Schlaf als üblich – nicht automatisch bessere Erholung.'
 }
 if(row.metric==='hrv_ms'){
  const change=median>0?diff/median:0
  return change<=-.15?'HRV deutlich unter dem jüngsten Median. Kann zu erhöhter Belastung passen; Verlauf und Befinden prüfen.':
   change>=.15?'HRV deutlich über dem jüngsten Median. Allein keine Trainingsfreigabe.':
   'HRV nahe dem jüngsten Median – einzelne Schwankungen sind normal.'
 }
 if(row.metric==='resting_heart_rate'){
  if(diff>=5)return 'Ruhepuls erhöht im Vergleich zu deiner Referenz. In Kombination mit weiteren Signalen prüfen.'
  if(diff<=-5)return 'Ruhepuls niedriger als die jüngste Referenz. Das allein beweist keine Erholung.'
  return 'Ruhepuls nahe deiner jüngsten Referenz – derzeit keine größere Abweichung.'
 }
 return 'Persönlichen Verlauf beobachten.'
}
export function recoveryDashboardMeaning(report,trend=null){
 if(!report||!Array.isArray(report.metrics))return 'Ohne aktuelle Messwerte ist keine Einordnung möglich.'
 const [sleep,hrv,pulse]=report.metrics
 const readable=[sleep,hrv,pulse].filter(x=>valid(x?.difference))
 if(!readable.length)return 'Noch keine verlässliche persönliche Vergleichsbasis.'
 const week=trend?.metrics?.hrv_ms
 const hrvContext=week&&valid(week.current)&&valid(week.previous)?
  ' HRV-Wochenmedian '+Math.round(week.current)+' statt '+Math.round(week.previous)+
  ' ms ('+(trend.status==='stable'?'stabil':trend.status==='higher'?'höher':'niedriger')+').':
  ''
 const hrvLow=valid(hrv?.difference)&&valid(hrv?.median)&&hrv.median>0&&hrv.difference/hrv.median<=-.15
 const pulseHigh=valid(pulse?.difference)&&pulse.difference>=5
 const sleepLow=valid(sleep?.difference)&&sleep.difference<=-3600
 if(hrvLow&&!pulseHigh&&!sleepLow)return 'Einordnung: Deine HRV liegt heute klar unter dem jüngsten Median.'+hrvContext+
  ' Schlaf und Ruhepuls liefern keinen ähnlich deutlichen Warnhinweis. Beobachte Verlauf und Befinden – keine automatische Trainingsfreigabe.'
 if(pulseHigh||sleepLow||hrvLow)return 'Einordnung: Mindestens ein Erholungswert weicht heute deutlich von deinem jüngsten Verlauf ab.'+hrvContext+
  ' Weitere Signale und dein Befinden sind für die Trainingsentscheidung entscheidend.'
 return 'Einordnung: Die verfügbaren Tageswerte zeigen keine große Abweichung zur jüngsten Referenz.'+hrvContext+
  ' Das ist keine Aussage über vollständige Erholung.'
}
