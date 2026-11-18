/** Clear, careful explanations of real Garmin measurements, with no invented readiness score. */
const valid=n=>typeof n==='number'&&Number.isFinite(n)
export function recoveryMetricMeaning(row){
 if(!row||!valid(row.latest))return 'Für heute fehlt noch ein Messwert.'
 if(!valid(row.median)||!valid(row.difference))return 'Es fehlen noch genügend Tage für einen Vergleich.'
 const diff=row.difference,typical=row.median
 if(row.metric==='sleep_seconds'){
  const minutes=Math.round(Math.abs(diff)/60)
  if(minutes<30)return 'Du hast ungefähr so lange geschlafen wie sonst.'
  return diff<0?
   minutes+' Min. weniger Schlaf als sonst. Wenn du müde bist, mach heute lieber etwas ruhiger.':
   minutes+' Min. mehr Schlaf als sonst. Ob du erholt bist, merkst du auch an deinem Körpergefühl.'
 }
 if(row.metric==='hrv_ms'){
  const change=typical>0?diff/typical:0
  if(change<=-.15)return 'Deine HRV ist niedriger als sonst. Das kann zu mehr Belastung passen – beobachte den Verlauf.'
  if(change>=.15)return 'Deine HRV ist höher als sonst. Ein guter Einzelwert bedeutet nicht automatisch, dass du fit bist.'
  return 'Deine HRV liegt ungefähr im gewohnten Bereich. Kleine Schwankungen sind normal.'
 }
 if(row.metric==='resting_heart_rate'){
  if(diff>=5)return 'Dein Ruhepuls liegt höher als sonst. Schau, ob das mehrere Tage so bleibt.'
  if(diff<=-5)return 'Dein Ruhepuls liegt niedriger als sonst. Ein einzelner Wert sagt noch wenig über deine Erholung.'
  return 'Dein Ruhepuls ist ungefähr so wie sonst.'
 }
 return 'Schau, wie sich dein Wert über mehrere Tage entwickelt.'
}
export function recoveryDashboardMeaning(report){
 if(!report||!Array.isArray(report.metrics))return 'Noch keine aktuellen Werte vorhanden.'
 const [sleep,hrv,pulse]=report.metrics
 const available=[sleep,hrv,pulse].filter(x=>valid(x?.difference))
 if(!available.length)return 'Wir brauchen noch ein paar Tage mit Messwerten, um sie sinnvoll zu vergleichen.'
 const hrvLow=valid(hrv?.difference)&&valid(hrv?.median)&&hrv.median>0&&hrv.difference/hrv.median<=-.15
 const pulseHigh=valid(pulse?.difference)&&pulse.difference>=5
 const sleepLow=valid(sleep?.difference)&&sleep.difference<=-3600
 if(sleepLow&&!hrvLow&&!pulseHigh)return 'Du hast deutlich weniger geschlafen als sonst. Achte heute auf Müdigkeit und gönn dir bei Bedarf mehr Ruhe.'
 if(hrvLow&&!pulseHigh&&!sleepLow)return 'Deine HRV ist heute niedriger als sonst. Schlaf und Ruhepuls fallen nicht stark auf. Entscheidend ist auch, wie du dich fühlst.'
 if(pulseHigh||sleepLow||hrvLow)return 'Ein oder mehrere Werte fallen heute auf. Schau dir unten die Details an und achte auf dein Körpergefühl.'
 return 'Deine Werte sehen ähnlich aus wie sonst. Ob du dich wirklich fit fühlst, können Zahlen allein nicht sagen.'
}
