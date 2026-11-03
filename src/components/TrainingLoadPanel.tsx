import { useMemo } from 'react'
import { Icon } from './Icon'
import '../styles/training-load.css'

export type TrainingSummary = {
  source: string
  windowDays: 28
  historyStatus: 'complete' | 'backfill' | 'unknown'
  truncated: boolean
  activityCount7: number
  activityCount28: number
  runKm7: number
  runKm28: number
  previousRunKm7: number
  minutes7: number
  minutes28: number
  previousMinutes7: number
  weeklyRunKm: number[]
  sportCounts: { running: number; cycling: number; strength: number; soccer: number; other: number }
  avgHeartRateAvailable28: number
  rpeAvailable28: number
}

const num = (n: number, places = 0) => Number.isFinite(n)
  ? n.toLocaleString('de-DE', { minimumFractionDigits: places, maximumFractionDigits: places })
  : '–'

export function TrainingLoadPanel({ training }: { training: TrainingSummary | null }) {
  const weeks = useMemo(() => training?.weeklyRunKm ?? [0, 0, 0, 0], [training])
  const max = Math.max(1, ...weeks)
  const incomplete = !training || training.historyStatus !== 'complete' || training.truncated

  return <section className="ri-domain ri-training tl-domain" aria-label="Trainingsbelastung aus Garmin-Aktivitäten">
    <div className="ri-group-head">
      <div className="ri-group-title-wrap">
        <span className="ri-group-icon"><Icon name="activity" /></span>
        <div><span className="ri-index">03 / INDICATORS</span><h4>Trainingsbelastung</h4><p>Gemessener Umfang statt erfundener Trainingslast – Garmin-Aktivitäten der letzten 28 Tage.</p></div>
      </div>
      <span className="ri-group-aside">{incomplete ? 'Datenaufbau · vorläufig' : '28 Tage · vollständig importiert'}</span>
    </div>
    {!training ? <div className="ri-notice">Trainingsdaten momentan nicht verfügbar. Recovery-Werte bleiben davon unberührt. Prüfe die neue Edge Function.</div> : <>
      <div className="tl-key-metrics">
        <article className="tl-card tl-primary"><span>LAUFUMFANG · 7 TAGE</span><strong>{num(training.runKm7, 1)} <small>km</small></strong><p>Vorherige 7 Tage: {num(training.previousRunKm7, 1)} km</p></article>
        <article className="tl-card"><span>TRAININGSZEIT · 7 TAGE</span><strong>{num(training.minutes7)} <small>Min.</small></strong><p>Alle aufgezeichneten Sportarten · Vorwoche: {num(training.previousMinutes7)} Min.</p></article>
        <article className="tl-card"><span>LAUFUMFANG · 28 TAGE</span><strong>{num(training.runKm28, 1)} <small>km</small></strong><p>{training.activityCount28} aufgezeichnete Aktivitäten · {num(training.minutes28)} Trainingsminuten</p></article>
      </div>
      <div className="tl-bottom">
        <article className="tl-chart-card">
          <div className="tl-card-header"><strong>Deine Laufwochen</strong><span>Vier aufeinanderfolgende 7-Tage-Blöcke · km</span></div>
          <div className="tl-bars">{weeks.map((km, i) => <div className="tl-bar-item" key={i}>
            <div className="tl-bar-value">{num(km, 1)}</div>
            <div className="tl-bar-track"><div className="tl-bar-fill" style={{ height: `${Math.max(km > 0 ? 4 : 0, km / max * 100)}%` }} /></div>
            <span>{['Vor 22–28 Tg.', 'Vor 15–21 Tg.', 'Vor 8–14 Tg.', 'Letzte 7 Tg.'][i]}</span>
          </div>)}</div>
        </article>
        <article className="tl-mix-card">
          <div className="tl-card-header"><strong>Dein Trainingsmix</strong><span>28 Tage · Anzahl Einheiten</span></div>
          <div className="tl-mix-row"><span>Laufen</span><b>{training.sportCounts.running}</b></div>
          <div className="tl-mix-row"><span>Fußball</span><b>{training.sportCounts.soccer}</b></div>
          <div className="tl-mix-row"><span>Radfahren</span><b>{training.sportCounts.cycling}</b></div>
          <div className="tl-mix-row"><span>Kraft / Stabi / Mobility</span><b>{training.sportCounts.strength}</b></div>
          <div className="tl-mix-row"><span>Weitere Aktivitäten</span><b>{training.sportCounts.other}</b></div>
          <div className="tl-data-detail">Ø HF vorhanden: {training.avgHeartRateAvailable28}/{training.activityCount28} · Garmin-RPE vorhanden: {training.rpeAvailable28}/{training.activityCount28}</div>
        </article>
      </div>
      <div className="tl-note"><Icon name="info" /><p>{incomplete
        ? 'Die historische Garmin-Synchronisierung ist noch nicht als vollständig bestätigt. Alle Angaben sind vorläufig und können mit weiteren Importen steigen.'
        : 'Der historische Aktivitätenimport ist abgeschlossen. Alle Angaben basieren auf den gespeicherten Garmin-Aktivitäten.'
      } Durchschnitts-HF ist keine HF-Zonen-Verteilung. Garmin-RPE wird erst nach Prüfung der Rohwert-Skala interpretiert. Keine automatische Trainingsfreigabe.</p></div>
    </>}
  </section>
}
