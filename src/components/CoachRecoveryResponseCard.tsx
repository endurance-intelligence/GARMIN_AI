import {coachRecoveryResponse} from '../lib/coachRecoveryResponse.mjs'
import type {RecoveryResponseGroup} from '../lib/coachRecoveryResponse.mjs'
const fmt=(n:number)=>(n>0?'+':'')+n.toLocaleString('de-DE',{maximumFractionDigits:1})
export function CoachRecoveryResponseCard({active,today,boards,health,onHealth}:{active:boolean;today:string;boards:unknown;health:unknown;onHealth:()=>void}){
 if(!active)return null
 const result=coachRecoveryResponse({today,boards,health})
 if(!result)return null
 const row=(title:string,r:RecoveryResponseGroup)=><div><strong>{title}</strong><p>HRV {fmt(r.hrvDelta)} ms · Ruhepuls {fmt(r.pulseDelta)} bpm</p><small>{r.count} Läufe aus {r.weeks} Kalenderwochen</small></div>
 return <details className="co-saved-note"><summary>Coach-Lernschleife · Regeneration nach dem Laufen</summary><p>So haben sich deine Garmin-Werte vom Lauftag zum Folgetag entwickelt. Grundlage: jeweils ein aufgezeichneter Lauf pro Tag mit deiner Garmin-Anstrengungsbewertung.</p>{row('Locker bewertet (RPE 1–4)',result.low)}{row('Sehr hart bewertet (RPE 8–10)',result.high)}<p>Median der gemessenen Veränderungen innerhalb der letzten 28 Kalendertage. Schlaf, Stress, andere nicht erfasste Belastungen und weitere Einflüsse können mitwirken. Kein Nachweis einer Ursache, keine automatische Planänderung.</p><button type="button" className="secondary" onClick={onHealth}>Gesundheitsverlauf ansehen</button></details>
}
