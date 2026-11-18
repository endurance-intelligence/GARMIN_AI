/** GARMIN_AI v0.7.1 — one evidence-first, goal-specific finding.
 * No physiological threshold estimate, diagnostic judgement, or auto plan change.
 */
import {analyzeSession} from './sessionAnalysis'
import type {SessionSample} from './sessionAnalysis'
import type {SessionGoal} from './sessionGoalReview'
import type {IntensityEvidence} from './intensityEvidence'

export type CoachFinding={level:'info'|'attention';title:string;explanation:string;evidence:string}
export type CoachContext={
  samples:SessionSample[]; goal:SessionGoal; recentIllness:boolean; lapCount:number
  cap:number|null; capSource:'manual'|'historical-garmin'|'none'
  intensity:IntensityEvidence; profileSource:'historical'|'current'|'missing'
}
const hrOk=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=35&&x<=220
const speedOk=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=1.2&&x<=8
const de=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
export function coachFinding(c:CoachContext):CoachFinding {
  const valid=c.samples.map(s=>s.hr).filter(hrOk)
  const enough=valid.length>=80&&c.samples.length>0&&valid.length/c.samples.length>=.75
  if(c.recentIllness) return {level:'attention',title:'Wiedereinstieg: Belastung vorsichtig einordnen',
    explanation:'Du hast eine kürzliche Erkrankung angegeben. Die HF-Daten erlauben keine Trainingsfreigabe; ausgefallene Kilometer nicht nachholen. Bei anhaltenden Symptomen oder Warnzeichen ärztlich abklären.',
    evidence:`Kontext manuell gesetzt · ${valid.length} gültige HF-Messpunkte`}
  if(c.goal==='unknown') return {level:'info',title:'Trainingszweck fehlt noch',
    explanation:'Wähle den Zweck dieser Einheit. Ohne Trainingsziel können wir den Verlauf beschreiben, aber nicht sinnvoll bewerten.',
    evidence:`${valid.length} HF-Messpunkte · keine automatische Workout-Zuordnung`}
  if(!enough) return {level:'info',title:'Für diesen Lauf noch zu wenig HF-Daten',
    explanation:'Die vorhandene Messreihe reicht für einen belastbaren Zielvergleich nicht aus. Es werden keine fehlenden Messungen ergänzt.',
    evidence:`${valid.length} von ${c.samples.length} Messpunkten gültig · benötigt: mindestens 80 und 75 % Abdeckung`}

  if(c.goal==='easy'||c.goal==='recovery') {
    if(c.cap===null || c.capSource==='none') return {level:'info',title:'Locker geplant – persönliche Grenze nicht belegt',
      explanation:'Für diesen Lauf ist keine historisch dokumentierte individuelle HF-Grenze verfügbar. Die heutigen Garmin-Zonen werden nicht rückwirkend zur Zielbewertung verwendet.',
      evidence:`${valid.length} gültige HF-Messpunkte · Garmin-Zone 2 ist keine LT1-Messung`}
    const high=valid.filter(hr=>hr>c.cap!).length
    const pct=100*high/valid.length
    const origin=c.capSource==='manual'?'manuell gesetzte':'damals gespeicherte Garmin-'
    return {level:'info',title:'Locker geplant – HF-Verteilung geprüft',
      explanation:`${de(pct)} % der gültigen HF-Messpunkte lagen oberhalb deiner ${origin}Referenz von ${c.cap} bpm. Das ist ein Vergleich mit einer Referenz – kein Beleg für eine bestimmte physiologische Schwelle oder eine misslungene Einheit.`,
      evidence:`${high} / ${valid.length} HF-Messpunkte · ${c.capSource==='manual'?'persönlich angegebene Grenze':'historische Garmin-Gerätezone'}`}
  }
  if(c.goal==='intervals') {
    const high=c.intensity.status==='sufficient' && c.intensity.bands.length===7
      ? c.intensity.bands[4].share+c.intensity.bands[5].share : null
    const zoneText=high===null?'Ohne belastbare Zonenverteilung.':
      `${de(high)} % der HF-Messpunkte lagen in Garmin Z4/Z5 (${c.profileSource==='historical'?'historisches Profil':'heutige Zonen als rückblickende Orientierung'}).`
    return {level:'info',title:c.lapCount>0?'Intervalle: Intensität erkennbar, Wiederholungen offen':'Intervallbewertung noch nicht möglich',
      explanation:`${zoneText} ${c.lapCount>0?'Rundendaten allein weisen Belastungs- und Erholungsblöcke noch nicht zu.':'Es fehlen zugeordnete Belastungs- und Erholungsschritte.'} Keine Aussage zur Qualität einzelner Wiederholungen.`,
      evidence:`${valid.length} HF-Messpunkte · ${c.lapCount} verwertbare Runden`}
  }
  const a=analyzeSession(c.samples)
  if(c.goal==='long') {
    const comparable=a.hrChange!==null&&a.speedChangePercent!==null&&Math.abs(a.speedChangePercent)<=5
    const rising=comparable&&a.hrChange!>=5
    return {level:rising?'attention':'info',title:rising?'Long Run: HF steigt bei ähnlichem Tempo':'Long Run: Verlauf statt Spitzenwert',
      explanation:rising?`Die HF lag im späteren Vergleichsabschnitt um ${de(a.hrChange!)} bpm höher, während sich die Geschwindigkeit um ${de(a.speedChangePercent!)} % änderte. Das ist ein Hinweis, kein bestätigter Cardiac Drift; Gelände und Wetter fehlen.`:
        'Aus dieser Messreihe lässt sich ohne geplante Belastung, Gelände, Wetter und Verpflegung keine eindeutige Qualität des langen Laufs ableiten.',
      evidence:comparable?`Abschnittsvergleich · HF ${de(a.hrChange!)} bpm · Geschwindigkeit ${de(a.speedChangePercent!)} %`:
        'Kein ausreichend vergleichbarer HF-/Tempo-Abschnitt'}
  }
  if(c.goal==='tempo') {
    const speeds=c.samples.map(s=>s.speed).filter(speedOk).sort((a,b)=>a-b)
    if(speeds.length<80) return {level:'info',title:'Tempoeinheit: Geschwindigkeit unzureichend',
      explanation:'Ohne genügend plausible Geschwindigkeitspunkte lässt sich die Tempostreuung nicht verlässlich beschreiben. Solltempo und Trainingsabschnitte fehlen weiterhin.',
      evidence:`${speeds.length} plausible Geschwindigkeitsmesspunkte`}
    const low=speeds[Math.floor((speeds.length-1)*.1)]
    const high=speeds[Math.floor((speeds.length-1)*.9)]
    const spread=100*(high/low-1)
    return {level:'info',title:'Tempoeinheit: Geschwindigkeitsstreuung gemessen',
      explanation:`Das 10. bis 90. Perzentil der Geschwindigkeiten spannt ${de(spread)} % auf. Ohne Solltempo, Höhenprofil und Zuordnung der Trainingsabschnitte ergibt sich daraus kein Bestanden/Nicht-bestanden.`,
      evidence:`${speeds.length} plausible Tempomesspunkte · P10/P90-Vergleich`}
  }
  return {level:'info',title:'Keine Zielbewertung',explanation:'Die Trainingskategorie lässt hier noch kein belastbares Urteil zu.',evidence:`${valid.length} HF-Messpunkte`}
}
