/** GARMIN_AI v0.6.1: transparent, goal-aware observations.
 * Manual training goal, NO inferred workout intent, AI diagnosis or training permission.
 */
import { analyzeSession } from './sessionAnalysis'
import type { SessionSample, SessionSignal } from './sessionAnalysis'

export type SessionGoal = 'unknown' | 'easy' | 'recovery' | 'long' | 'tempo' | 'intervals'
export type GoalReview = { label: string; signals: SessionSignal[]; validHr: number; nWithSpeed: number }

const isValidHR = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 35 && v <= 220
const isValidSpeed = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1.2 && v <= 8
const fmt = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 })

export function reviewSessionGoal(
  samples: SessionSample[],
  goal: SessionGoal,
  hrCap: number | null,
  recentIllness: boolean,
  lapCount: number,
): GoalReview {
  const result = analyzeSession(samples)
  const hrs = samples.map(p => p.hr).filter(isValidHR)
  const speeds = samples.map(p => p.speed).filter(isValidSpeed).sort((a,b) => a-b)
  const cap = hrCap !== null && Number.isInteger(hrCap) && hrCap >= 75 && hrCap <= 210 ? hrCap : null
  const signals: SessionSignal[] = []

  if (goal === 'unknown') {
    signals.push({ level: 'info', title: 'Trainingsziel nicht zugeordnet', explanation: 'Wähle den Zweck dieser Einheit aus, damit der Analyst den gemessenen Verlauf in den richtigen Zusammenhang setzen kann. Das geplante Garmin-Workout ist hier noch nicht automatisch verknüpft.' })
  } else if (hrs.length < 80) {
    signals.push({ level: 'info', title: 'Zu wenig HF-Daten', explanation: 'Für eine belastbare Einordnung fehlen ausreichend gültige Herzfrequenzmesspunkte. Die Zuordnung zum Trainingsziel bleibt ohne Urteil.' })
  } else if (goal === 'easy' || goal === 'recovery') {
    if (cap === null) {
      signals.push({ level: 'info', title: 'Persönliche HF-Grenze fehlt', explanation: 'Der Lauf ist als locker bzw. regenerativ gekennzeichnet. Ohne deine individuelle HF-Obergrenze und Angaben zum Befinden ist nicht prüfbar, ob die Intensität dazu gepasst hat.' })
    } else {
      const above = hrs.filter(hr => hr > cap).length
      const share = 100 * above / hrs.length
      signals.push({
        level: share >= 15 ? 'attention' : share <= 5 ? 'positive' : 'info',
        title: share >= 15 ? 'Häufig oberhalb deiner HF-Vorgabe' : 'HF-Vorgabe im Messpunktvergleich',
        explanation: `${above} von ${hrs.length} gültigen HF-Messpunkten (${fmt(share)} %) lagen oberhalb deiner selbst gesetzten Grenze von ${cap} bpm. Dies ist ein Messpunktanteil, keine exakte Zeitangabe oder medizinische Trainingsfreigabe.`,
      })
    }
    if (result.hrChange !== null && result.speedChangePercent !== null && Math.abs(result.speedChangePercent) <= 5 && result.hrChange >= 5) {
      signals.push({ level: 'attention', title: 'HF nimmt bei ähnlicher Geschwindigkeit zu', explanation: `In den verglichenen Abschnitten stieg der Puls um rund ${Math.round(result.hrChange)} bpm bei ${fmt(Math.abs(result.speedChangePercent))} % Geschwindigkeitsänderung. Höhe, Temperatur, Pausen und Untergrund fehlen; daher nur ein Hinweis, kein gesicherter Cardiac Drift.` })
    }
  } else if (goal === 'long') {
    signals.push({ level: 'info', title: 'Langer Lauf: Gleichmäßigkeit wichtiger als Spitzenpace', explanation: 'Der Analysefokus liegt auf dem Verlauf über die gesamte Einheit. Verpflegung, Gelände, Wetter und die vorgesehene Belastung liegen hier noch nicht vollständig vor.' })
    if (result.hrChange !== null && result.speedChangePercent !== null && Math.abs(result.speedChangePercent) <= 5 && result.hrChange >= 5) {
      signals.push({ level: 'attention', title: 'Mögliche Ermüdung im Verlauf', explanation: `In den vergleichbaren Abschnitten stieg die HF um rund ${Math.round(result.hrChange)} bpm bei ähnlicher Geschwindigkeit. Ohne Höhenprofil und Temperatur lässt sich die Ursache nicht bestimmen.` })
    }
  } else if (goal === 'tempo') {
    if (speeds.length < 80) {
      signals.push({ level: 'info', title: 'Tempostabilität derzeit nicht bewertbar', explanation: 'Es fehlen genug plausible Geschwindigkeitsmesspunkte. Eine Aussage zur Einhaltung des Tempotrainings wäre nicht begründet.' })
    } else {
      const p10 = speeds[Math.floor((speeds.length-1) * 0.1)]
      const p90 = speeds[Math.floor((speeds.length-1) * 0.9)]
      const spread = 100 * (p90 / p10 - 1)
      signals.push({ level: spread >= 25 ? 'attention' : 'info', title: 'Geschwindigkeitsstreuung', explanation: `Zwischen dem 10. und 90. Perzentil liegt eine Differenz von ${fmt(spread)} %. Das zeigt Tempo-Unterschiede, bewertet aber ohne Solltempo, Pausen und Höhenprofil noch nicht die Qualität der Tempoeinheit.` })
    }
  } else if (goal === 'intervals') {
    signals.push({ level: 'info', title: lapCount > 0 ? 'Runden vorhanden' : 'Intervallrunden fehlen', explanation: lapCount > 0
      ? `${lapCount} Runden sind vorhanden. Die exakte Qualität einzelner Wiederholungen werten wir erst nach der Zuordnung zu Belastungs- und Trababschnitten aus.`
      : 'Garmin liefert für diese Aktivität noch keine verwertbaren Runden. Ohne Wiederholungsgrenzen und Sollpace darf der Analyst nicht behaupten, dass die Intervalle sauber oder unsauber waren.' })
  }

  if (recentIllness) {
    signals.unshift({ level: 'attention', title: 'Wiedereinstieg nach Erkrankung berücksichtigt', explanation: 'Du hast eine kürzliche Erkrankung angegeben. Gute HRV- oder HF-Werte allein erlauben keine sichere Trainingsfreigabe. Bei Fieber, Brustbeschwerden, ungewöhnlicher Atemnot oder anhaltenden Symptomen Training pausieren und ärztlich abklären; ausgefallene Kilometer nicht nachholen.' })
  }
  return { label: goal, signals, validHr: hrs.length, nWithSpeed: speeds.length }
}
