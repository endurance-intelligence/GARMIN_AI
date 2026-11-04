/** GARMIN_AI v0.6.3 – technical evidence screening, NOT an LT1/VT1 estimator.
 * All cutoffs are declared data-quality screening conventions, not physiological thresholds.
 * Input comes only from previously stored, GPS-free Garmin activity detail samples.
 */
export type RawSample = { hr?: unknown; speed?: unknown; elapsed?: unknown; timestamp?: unknown }
export type RunMetrics = {
  classification: 'comparable'|'limited'|'excluded'
  reason: string
  validHr: number
  validSpeed: number
  total: number
  earlyHr: number|null
  lateHr: number|null
  hrDifference: number|null
  speedDifferencePercent: number|null
  speedVariabilityPercent: number|null
  timing: 'elapsed'|'timestamp'|'unverified'
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const mean = (values: number[]): number => values.reduce((a,b)=>a+b,0)/values.length
const round = (v: number, digits = 1) => Number(v.toFixed(digits))

type Sample = { hr: number|null; speed: number|null; elapsed: number|null; timestamp: number|null }
function normalized(raw: unknown): Sample|null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as RawSample
  return {
    hr: finite(row.hr) && row.hr >= 35 && row.hr <= 220 ? row.hr : null,
    speed: finite(row.speed) && row.speed >= 0 && row.speed <= 12 ? row.speed : null,
    elapsed: finite(row.elapsed) && row.elapsed >= 0 ? row.elapsed : null,
    timestamp: finite(row.timestamp) && row.timestamp >= 0 ? row.timestamp : null,
  }
}
function timeAxis(points: Sample[], durationSeconds: number): { fractions: number[]; kind:RunMetrics['timing'] } {
  for (const field of ['elapsed','timestamp'] as const) {
    const observed=points.map(p=>p[field]); const valid=observed.filter(finite)
    if(valid.length < .8*points.length || valid.length < 100) continue
    const first=valid[0], last=valid[valid.length-1]; const span=last-first
    if(span<=0) continue
    // Descriptors may report elapsed seconds or milliseconds. Only accept a plausible span.
    const scale=span > durationSeconds*5 ? 1000 : 1
    const realSpan=span/scale
    if(realSpan < durationSeconds*.6 || realSpan > durationSeconds*1.3) continue
    let previous=-Infinity, monotonic=true
    for (const x of valid) {if(x < previous){monotonic=false;break} previous=x}
    if(!monotonic) continue
    return { kind:field, fractions:observed.map((x,i)=>finite(x)?(x-first)/span:i/Math.max(1,points.length-1)) }
  }
  return {kind:'unverified',fractions:points.map((_,i)=>i/Math.max(1,points.length-1))}
}
function empty(reason:string,total:number,hr:number,speed:number,timing:RunMetrics['timing']='unverified'):RunMetrics{
  return { classification:'excluded',reason,validHr:hr,validSpeed:speed,total,earlyHr:null,lateHr:null,
    hrDifference:null,speedDifferencePercent:null,speedVariabilityPercent:null,timing }
}
export function screenRun(input:unknown,durationSeconds:number):RunMetrics {
  if(!Array.isArray(input) || !finite(durationSeconds) || durationSeconds<1800 || durationSeconds>12000)
    return empty('Dauer außerhalb des Untersuchungsfensters (30–200 min)',Array.isArray(input)?input.length:0,0,0)
  const points=input.slice(0,1800).map(normalized).filter((p):p is Sample=>p!==null)
  const total=points.length,validHr=points.filter(p=>p.hr!==null).length,validSpeed=points.filter(p=>p.speed!==null && p.speed>=1.2 && p.speed<=8).length
  if(total<180 || validHr<150 || validHr/Math.max(1,total)<.75)
    return empty('HF-Messreihe nicht ausreichend vollständig',total,validHr,validSpeed)
  if(validSpeed<150 || validSpeed/Math.max(1,total)<.75)
    return empty('Geschwindigkeitsmessung nicht ausreichend vollständig',total,validHr,validSpeed)
  const slowFraction=points.filter(p=>p.speed!==null && p.speed<1.2).length/total
  if(slowFraction>.07)return empty('Zu viele Stopps oder Gehabschnitte',total,validHr,validSpeed)
  const axis=timeAxis(points,durationSeconds)
  const sections=[points.map((p,i)=>({...p,f:axis.fractions[i]})).filter(p=>p.f>=.20&&p.f<.40),
    points.map((p,i)=>({...p,f:axis.fractions[i]})).filter(p=>p.f>=.60&&p.f<.80)]
  const sectionStats=sections.map(section=>{
    const measured=section.filter(p=>p.hr!==null && p.speed!==null && p.speed>=1.2 && p.speed<=8)
    return { count:measured.length, hr:measured.length?mean(measured.map(p=>p.hr!)):null,
      speed:measured.length?mean(measured.map(p=>p.speed!)):null }
  })
  if(sectionStats.some(s=>s.count<30 || s.hr===null || s.speed===null))
    return empty('Vergleichsabschnitte unvollständig',total,validHr,validSpeed,axis.kind)
  const [first,late]=sectionStats as [{count:number;hr:number;speed:number},{count:number;hr:number;speed:number}]
  const difference=100*(late.speed-first.speed)/first.speed
  const middle=points.map((p,i)=>({...p,f:axis.fractions[i]}))
  const binSpeeds:number[]=[]
  for(let i=0;i<6;i++) {
    const values=middle.filter(p=>p.f>=.2+i*.1 && p.f<.3+i*.1 && p.speed!==null && p.speed>=1.2 && p.speed<=8).map(p=>p.speed!)
    if(values.length<12)return empty('Zu wenige Werte in den Teilabschnitten',total,validHr,validSpeed,axis.kind)
    binSpeeds.push(mean(values))
  }
  const avg=mean(binSpeeds)
  const variability=100*Math.sqrt(mean(binSpeeds.map(x=>(x-avg)**2)))/avg
  const base={validHr,validSpeed,total,earlyHr:round(first.hr),lateHr:round(late.hr),
    hrDifference:round(late.hr-first.hr),speedDifferencePercent:round(difference),
    speedVariabilityPercent:round(variability),timing:axis.kind}
  if(Math.abs(difference)>8 || variability>8)
    return {...base,classification:'excluded',reason:'Tempo in den Vergleichsabschnitten zu ungleichmäßig'}
  if(axis.kind==='unverified')
    return {...base,classification:'limited',reason:'Vergleich möglich, aber Zeitachse der Messreihe nicht verifiziert'}
  return {...base,classification:'comparable',reason:'Gleichmäßige Geschwindigkeit und ausreichend HF-Daten für einen deskriptiven Vergleich'}
}
