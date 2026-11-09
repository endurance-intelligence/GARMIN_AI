import type { Page } from '../navigation'
import { GarminAuthSettings } from '../components/GarminAuthSettings'
import { HeartRateZonesSettings } from '../components/HeartRateZonesSettings'
import { SyncCenter } from '../components/SyncCenter'

export function SettingsPage({ active }: { active: boolean; onGo: (page: Page) => void }) {
  return <section className={active ? 'page active' : 'page'}>
    <div className="page-intro"><div><div className="eyebrow">PERSONAL WORKSPACE</div><h1>Weniger Settings.<br/>Mehr Fokus<span style={{ color: 'var(--a)' }}>.</span></h1><p>Deine Verbindungen und Freigaben an einem Ort.</p></div></div>
    <nav className="settings-shortcuts" aria-label="Zu den Einstellungen">
      <button type="button" onClick={() => document.getElementById('settings-sync')?.scrollIntoView({behavior:'smooth'})}>Synchronisierung</button>
      <button type="button" onClick={() => document.getElementById('settings-account')?.scrollIntoView({behavior:'smooth'})}>Konto</button>
      <button type="button" onClick={() => document.getElementById('settings-zones')?.scrollIntoView({behavior:'smooth'})}>HF-Zonen</button>
    </nav>
    <div className="sub-grid">
      <article><small>CONNECTIONS</small><h3>Garmin Personal API</h3><p>Garmin-Aktivitäten und Health-Werte werden serverseitig nach Supabase synchronisiert. Der persönliche Lesezugriff ist separat geschützt.</p><div className="empty-line">Datenquelle: Garmin / Supabase · Automatische Synchronisierung eingerichtet</div></article>
      <article><small>COACH MODE</small><h3>Aktiver Coach mit Freigabe</h3><p>Trainingsempfehlungen sind derzeit eine Demo. Echte Änderungen am Plan werden nicht vorgenommen.</p><label className="toggle"><input type="checkbox" checked disabled/> Coach-Änderungen immer bestätigen</label></article>
    </div>
    <div id="settings-sync" className="settings-anchor">
      <h2 className="settings-section-title">Synchronisierung</h2>
      <SyncCenter active={active} mode="status"/>
    </div>
    <div id="settings-account" className="settings-anchor">
      <h2 className="settings-section-title">Konto und Anmeldung</h2>
      <GarminAuthSettings/>
    </div>
    <div id="settings-zones" className="settings-anchor">
      <h2 className="settings-section-title">Herzfrequenzzonen</h2>
      <HeartRateZonesSettings active={active}/>
    </div>
  </section>
}
