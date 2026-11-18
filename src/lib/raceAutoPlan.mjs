/** Race-day proposal based on already-established athlete/event facts; never fabricate unknown courses. */
export function recommendRacePlan(goal){
 if(!goal||!Number.isFinite(Number(goal.distance_km)))return null
 const name=String(goal.race_name||'').toLowerCase()
 const heartbeat=name.includes('heartbeat')&&name.includes('fulda')&&
  Math.abs(Number(goal.distance_km)-112)<0.2
 if(!heartbeat)return null
 return {
  courseMode:'laps',loopKm:'6',movingMinutes:'42',regularPause:'3',
  longStopEvery:'3',longStopMinutes:'8',pace:'6:55',
  carbs:'75',fluid:'500',sodium:'500',
  fuelNotes:'75 g KH/h ≈ 300 kcal/h aus KH, z. B. 226ERS High Energy (50 g) + Maurten 100 (25 g) oder verträgliche Alternativen. Getränke-KH mitrechnen. Keine Zitrus-Aromen; Natrium als Startwert an Wetter/Schweiß anpassen.',
  stopsNotes:'18 × 6 km + 4 km. Normale Runde: 42 Min. laufen + 3 Min. Pause, nach 45 Min. erneut los. Alle 3 Runden 8 Min. extra (zusammen 11 Min.) für Schuhe, Kleidung, Essen.',
  gearNotes:'Ersatzschuhe/Socken, Wechselshirt, warme regendichte Schicht, Stirnlampe, reflektierende Elemente, 3-Runden-Versorgungsset.'
 }
}
