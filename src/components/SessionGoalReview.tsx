import { useMemo, useState } from 'react'
import type { SessionSample } from '../lib/sessionAnalysis'
import { reviewSessionGoal } from '../lib/sessionGoalReview'
import type { SessionGoal } from '../lib/sessionGoalReview'
import '../styles/session-intelligence.css'

const goals: { value: SessionGoal; label: string }[] = [
  { value: 'unknown', label: 'Noch nicht zugeordnet' },
  { value: 'easy', label: 'Easy Run · locker' },
  { value: 'recovery', label: 'Recovery · regenerativ' },
  { value: 'long', label: 'Long Run · langer Lauf' },
  { value: 'tempo', label: 'Tempo · zügig' },
  { value: 'intervals', label: 'Intervalle · Wiederholungen' },
]

export function SessionGoalReview({ samples, lapCount }: {
  samples: SessionSample[]
  lapCount: number
}) {
  const [goal, setGoal] = useState<SessionGoal>('unknown')
  const [limitText, setLimitText] = useState('')
  const [recentIllness, setRecentIllness] = useState(false)
  const cap = limitText.trim() ? Number(limitText) : null
  const validCap = cap !== null && Number.isInteger(cap) && cap >= 75 && cap <= 210 ? cap : null
  const review = useMemo(() => reviewSessionGoal(samples, goal, validCap, recentIllness, lapCount), [samples, goal, validCap, recentIllness, lapCount])

  return <section className="lsi-wrap" aria-label="Trainingszielbezogene Analyse">
    <div className="lsi-heading">
      <div><span className="micro-label">SESSION INTELLIGENCE / v0.6.1</span><h3>Wofür war diese Einheit gedacht?</h3></div>
      <span className="lsi-pill">Manueller Kontext · noch keine Planverknüpfung</span>
    </div>
    <p className="lsi-description">Ordne das Trainingsziel zu. Der Analyst verbindet es mit deinen echten HF- und Tempodaten. Ohne verifizierte Zielzone oder Sollpace wird kein Trainingsurteil erfunden.</p>
    <div className="lsi-controls">
      <label>Trainingsziel
        <select value={goal} onChange={event => setGoal(event.target.value as SessionGoal)}>
          {goals.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </label>
      {(goal === 'easy' || goal === 'recovery') && <label>Deine HF-Obergrenze (optional · bpm)
        <input type="number" min="75" max="210" step="1" value={limitText} placeholder="z. B. 140" onChange={event => setLimitText(event.target.value)} />
        {limitText && validCap === null && <small className="lsi-validation">Bitte ganze Zahl zwischen 75 und 210 eingeben.</small>}
      </label>}
      <label className="lsi-illness"><input type="checkbox" checked={recentIllness} onChange={event => setRecentIllness(event.target.checked)} /> <span>Wiedereinstieg nach Erkrankung</span></label>
    </div>
    <div className="lsi-signals">
      {review.signals.map((signal, index) => <article key={`${signal.title}-${index}`} className={`lsi-signal lsi-${signal.level}`}>
        <strong>{signal.title}</strong><p>{signal.explanation}</p>
      </article>)}
    </div>
    <p className="lsi-disclaimer">Die Eingaben gelten nur für die aktuell angezeigte Einheit und werden nicht gespeichert. Keine automatische Änderung an Garmin oder deinem Trainingsplan.</p>
  </section>
}
