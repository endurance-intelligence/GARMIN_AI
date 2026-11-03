import type { Page } from '../navigation'
import { GarminAuthSettings } from '../components/GarminAuthSettings'
import { HeartRateZonesSettings } from '../components/HeartRateZonesSettings'

export function SettingsPage({ active }: { active: boolean; onGo: (page: Page) => void }) {
  return <section className={active ? 'page active' : 'page'}>
    <div className="page-intro"><div><div className="eyebrow">PERSONAL WORKSPACE</div><h1>Weniger Settings.<br/>Mehr Fokus<span style={{ color: 'var(--a)' }}>.</span></h1><p>Deine Verbindungen und Freigaben an einem Ort.</p></div></div>
    <div className="sub-grid">
      <article><small>CONNECTIONS</small><h3>Garmin Personal API</h3><p>Garmin-Aktivitäten und Health-Werte werden serverseitig nach Supabase synchronisiert. Der persönliche Lesezugriff ist separat geschützt.</p><div className="empty-line">Datenquelle: Garmin / Supabase · Automatische Synchronisierung eingerichtet</div></article>
      <article><small>COACH MODE</small><h3>Aktiver Coach mit Freigabe</h3><p>Trainingsempfehlungen sind derzeit eine Demo. Echte Änderungen am Plan werden nicht vorgenommen.</p><label className="toggle"><input type="checkbox" checked disabled/> Coach-Änderungen immer bestätigen</label></article>
    </div>
    <GarminAuthSettings/>
    <HeartRateZonesSettings active={active}/>
  </section>
}
