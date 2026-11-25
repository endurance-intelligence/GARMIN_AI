/** Explicit, owner-confirmed availability. Activity history never implies ownership. */
export const EQUIPMENT_OPTIONS=[
 {id:'bodyweight',label:'Körpergewicht',description:'Stabi, Kraft und Mobility'},
 {id:'rowing',label:'Rudergerät',description:'Gelenkschonendere aerobe Alternative'},
 {id:'treadmill',label:'Laufband',description:'Indoor-Lauftraining und Power Hiking'},
 {id:'bike',label:'Fahrrad',description:'Ausdauertraining draußen'},
 {id:'trainer',label:'Indoor-Rollentrainer',description:'Ausdauertraining zu Hause'}
]
export function normalizeEquipmentProfile(value){
 if(!value||typeof value!=='object'||!Array.isArray(value.available))return null
 const ids=EQUIPMENT_OPTIONS.map(x=>x.id)
 if(value.available.some(x=>!ids.includes(x))||new Set(value.available).size!==value.available.length)return null
 const available=ids.filter(x=>value.available.includes(x))
 const incline=value.treadmillMaxInclinePct
 if(incline!==null&&(!available.includes('treadmill')||typeof incline!=='number'||!Number.isFinite(incline)||incline<0||incline>40||Math.round(incline*10)!==incline*10))return null
 return {available,treadmillMaxInclinePct:incline}
}
export function hasEquipment(profile,kind){
 const p=normalizeEquipmentProfile(profile)
 return p!==null&&(kind==='cycling'?p.available.includes('bike')||p.available.includes('trainer'):p.available.includes(kind))
}
