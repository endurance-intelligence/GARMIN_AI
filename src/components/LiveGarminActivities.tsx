import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import '../styles/garmin-live.css'

type Activity = {
  id: string; name: string; date: string; distanceKm: number | null;
  durationMin: number | null; averageHR: number | null;
  rpe: number | null; feeling: number | null;
}
type Response = { source: string; activities: Activity[]; count: number }

export function LiveGarminActivities({ active }: { active: boolean }) {
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    fetch('/api/garmin/activities', { cache: 'no-store' })
      .then(async r => {
        const body: unknown = await r.json()
        if (!r.ok) {
          const message = (body && typeof body === 'object' && 'error' in body) ? String(body.error) : 'Unbekannter Fehler'
          throw new Error(message)
        }
        return body as Response
      })
      .then(result => { if (live) {setData(result); setError(''); setLoading(false)} })
      .catch((e: unknown) => { if (live) {setError(e instanceof Error ? e.message : 'Keine Verbindung'); setLoading(false)} })
    return () => { live = false }
  }, [active, revision])

  return <section className={active ? 'page active garmin-live-page' : 'page garmin-live-page'} aria-label="Garmin Aktivitaeten live">
    <article className="garmin-live-card">
      <div className="garmin-live-heading">
        <div><div className="micro-label">LIVE / GARMIN PERSONAL API</div><h3>Deine letzten Aktivitäten.</h3>
          <p>Direkt von Garmin gelesen. Kein KI-Urteil und keine Demowerte.</p></div>
        <button className="secondary" type="button" onClick={() => {setLoading(true); setRevision(r=>r+1)}} disabled={loading}>
          <Icon name="activity"/> {loading ? 'Lade ...' : 'Aktualisieren'}
        </button>
      </div>
      {error ? <div className="garmin-live-info" role="status">{error}<br/>Die Coach- und Analyst-Demos bleiben davon unberührt.</div> : null}
      {!error && !data ? <div className="garmin-live-info">{loading ? 'Garmin wird abgefragt ...' : 'Verbindung wird geprüft ...'}</div> : null}
      {data && !error && <div className="garmin-live-list">
        {data.count === 0 && <div className="garmin-live-info">Keine Aktivitäten gefunden.</div>}
        {data.activities.map(a => <div className="garmin-live-row" key={a.id}>
          <div className="garmin-live-main"><strong>{a.name}</strong><small>{a.date ? a.date.slice(0,16).replace('T',' · ') : 'Datum unbekannt'}</small></div>
          <div className="garmin-live-numbers">
            {a.distanceKm !== null && <span>{a.distanceKm.toLocaleString('de-DE')} km</span>}
            {a.durationMin !== null && <span>{a.durationMin} min</span>}
            {a.averageHR !== null && <span>Ø {a.averageHR} bpm</span>}
            {a.rpe !== null && <span>RPE {a.rpe}</span>}
            {a.feeling !== null && <span>Feeling {a.feeling}</span>}
          </div>
          {/^\d+$/.test(a.id) && <a className="garmin-live-link" href={'https://connect.garmin.com/app/activity/'+a.id} target="_blank" rel="noopener noreferrer" aria-label="In Garmin Connect öffnen"><Icon name="arrow-up-right"/></a>}
        </div>)}
      </div>}
      <div className="garmin-live-note">Nur auf diesem Rechner im Entwicklungsmodus. Die KI-Auswertung oben verwendet weiterhin ausschließlich gekennzeichnete Beispieldaten.</div>
    </article>
  </section>
}
