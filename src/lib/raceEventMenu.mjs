/**
 * Heartbeat Ultra Fulda 21 Nov 2026: user-provided organiser catering list.
 * This confirms EVENT OFFERINGS, not stop-by-stop availability, portions,
 * nutritional labels, actual intake, or drink-mix strength.
 *
 * Do not automatically book CHO, caffeine or sodium from this menu.
 */
export const HEARTBEAT_MENU_2026=Object.freeze({
 raceName:'Heartbeat Ultra Fulda',raceDate:'2026-11-21',
 source:'Vom Athleten mitgeteilte Veranstalterliste',
 carbs:[
  'MAURTEN Gels','MAURTEN Riegel','MAURTEN Carbdrink',
  'Apfel','Banane','Orange',
  'belegte Brötchen (süß und herzhaft)',
  'Kartoffeln','Nudeln mit Tomatensoße (Nelles Catering)',
  'Salzbrezeln','Schorle','Kuchen'
 ],
 saltyWarm:[
  'Brühe','Essiggurken','Gurke mit Salz','gesalzene Erdnüsse'
 ],
 otherDrinks:['Wasser','Tee','Kaffee','Cola'],
 caffeine:['MAURTEN Koffein-Gels (Variante nicht bestätigt)','Kaffee','Cola',
  'Tee (sortenabhängig)'],
 carbDrinkStrength:'unknown',
 note:'Vorhanden laut Veranstalterliste; nicht garantiert an jeder Station. '+
  'Keine Portion, KH-Menge, Natriummenge oder Koffeinaufnahme bestätigt.'
})

/** Scope known race menu to its one verified 2026 event only. */
export function eventMenuForRace({raceName='',raceDate=''}={}){
 if(typeof raceName!=='string'||raceDate!=='2026-11-21'||
  !/\bheartbeat\b/i.test(raceName))return null
 return HEARTBEAT_MENU_2026
}
const shortFoods=[
 'etwas Banane','ein Stück süß belegtes Brötchen',
 'ein paar Salzbrezeln','etwas Apfel',
 'ein Stück herzhaft belegtes Brötchen','etwas Banane'
]
const longFoods=[
 'kleine Portion Nudeln mit Tomatensoße (Nelles Catering)',
 'kleine Portion Kartoffeln',
 'ein Stück herzhaft belegtes Brötchen'
]
const lateFoods=['etwas Banane','ein paar Salzbrezeln','kleine Portion Kartoffeln']
const pick=(arr,index)=>arr[((index%arr.length)+arr.length)%arr.length]
/** Choices are qualitative suggestions from offered foods; no portion arithmetic. */
export function suggestEventFood(menu,{round=1,longPause=false,arrivalMinutes=0}={}){
 if(menu!==HEARTBEAT_MENU_2026||!Number.isInteger(round)||round<1)return null
 const late=Number.isFinite(arrivalMinutes)&&arrivalMinutes>=600
 if(longPause){
  const index=Math.max(0,Math.floor(round/3)-1)
  const primary=late?pick([
   'kleine Portion Kartoffeln',
   'etwas Banane',
   'kleine Portion Nudeln mit Tomatensoße (Nelles Catering)'
  ],index):pick(longFoods,index)
  const alternative=primary.includes('Kartoffeln')?
   'kleine Portion Nudeln mit Tomatensoße (Nelles Catering)':
   'kleine Portion Kartoffeln'
  return {primary,alternative,availableAtEvent:true,
   sideNote:'Bei Bedarf warme Brühe oder Essiggurke dazu; Salzgehalt unbekannt.'}
 }
 const arr=late?lateFoods:shortFoods
 const primary=pick(arr,round-1)
 const alternative=primary.includes('Banane')?
  'ein paar Salzbrezeln':'etwas Banane'
 return {primary,alternative,availableAtEvent:true,
  sideNote:late?'Kleine, erprobte Portion bevorzugen; auf Verträglichkeit achten.':null}
}
