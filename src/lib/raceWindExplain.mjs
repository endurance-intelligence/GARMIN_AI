/** Compact athlete-facing interpretation of predicted peak gusts, not an official warning.
 * German DWD wind warning criteria start above 50 km/h; markanter Wind starts at 65 km/h.
 * Peak gusts are not sustained wind speed and do not imply a Beaufort value.
 */
export function explainRaceGust(gustKmh,minTempC){
 if(!Number.isFinite(gustKmh)||gustKmh<0)return null
 const cold=Number.isFinite(minTempC)&&minTempC<=5
 const coldText=cold?' Bei Kälte besonders in Geh- und Versorgungspausen auf Windschutz achten.':''
 if(gustKmh<=34)return {
  label:'Gut beherrschbar',tone:'calm',
  guidance:'Auf freien Abschnitten spürbar, normalerweise kein großes Laufhindernis.'+coldText
 }
 if(gustKmh<=50)return {
  label:'Deutlich spürbar',tone:'notice',
  guidance:'Auf offenen Abschnitten kann Gegenwind Kraft kosten. Kleidung und Tempo darauf abstimmen.'+coldText
 }
 if(gustKmh<65)return {
  label:'Kräftige Böen',tone:'caution',
  guidance:'Gegenwind und Auskühlung können relevant werden. Aktuelle Wetterwarnungen vor dem Start prüfen.'+coldText
 }
 if(gustKmh<90)return {
  label:'Stürmische Böen',tone:'warning',
  guidance:'Erhöhtes Risiko auf offenen Abschnitten und bei Bäumen. Veranstalterhinweise und amtliche Warnungen prüfen.'+coldText
 }
 return {
  label:'Sehr starke Sturmböen',tone:'warning',
  guidance:'Erhebliche Wettergefahr möglich. Amtliche Warnungen und Veranstalteranweisungen beachten; Startbedingungen kritisch prüfen.'+coldText
 }
}
