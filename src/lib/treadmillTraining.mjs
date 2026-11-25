import {normalizeEquipmentProfile,hasEquipment} from './equipmentProfile.mjs'
/** Conservative alternative to an already-open easy run. Duration never exceeds
 * the existing proposal. No device control, guessed pace or HR zones. */
export function buildTreadmillSession({equipment,profile,minutes,preferHills=false}={}){
 const eq=normalizeEquipmentProfile(equipment)
 if(!eq||!hasEquipment(eq,'treadmill')||!profile||profile.kind==='unknown'||!Number.isFinite(minutes)||minutes<20)return null
 if(profile.daysUntil!==null&&profile.daysUntil<=10)return null
 const total=Math.min(30,Math.floor(minutes))
 const limit=eq.treadmillMaxInclinePct
 // Introduce gentle inclines only when course elevation is known, the user
 // confirmed a sufficient device limit and there is time to adapt.
 const uphill=preferHills&&profile.hills&&profile.daysUntil!==null&&profile.daysUntil>21&&limit!==null&&limit>=2
 const incline=uphill?Math.min(4,limit):0
 const warm=5,cool=5,main=total-warm-cool
 const segments=[
  {label:'Einlaufen / Gehen',minutes:warm,incline:0,intensity:'Sehr locker'},
  {label:uphill?'Power Hiking':'Lockerer Lauf',minutes:main,incline,intensity:uphill?'Zügiges Gehen im Sprechtempo':'Lockeres Laufen im Sprechtempo'},
  {label:'Ausgehen / Auslaufen',minutes:cool,incline:0,intensity:'Sehr locker'}
 ]
 return {kind:uphill?'treadmill-hike':'treadmill-run',title:uphill?'Laufband · lockeres Power Hiking':'Laufband · lockerer Lauf',minutes:total,intensity:'Locker · ganze Sätze sprechen können',segments,
  reason:uphill?'Gezielter Bergaufreiz für das bestätigte Höhenprofil, statt des offenen lockeren Laufs. Langsam an die Steigung gewöhnen; bei zu hoher Anstrengung Steigung oder Tempo senken.':'Option für denselben lockeren Ausdauerreiz drinnen. Keine zusätzliche Einheit und kein starres Tempo.',
  note:limit===null?'Maximale Steigung nicht bekannt: nur flach bzw. niedrigste sichere Einstellung.':'Hinterlegte Gerätegrenze: '+limit.toLocaleString('de-DE')+' %. Diese wird nicht als Trainingsziel verwendet.'}
}
