import type {Page} from '../navigation'
export function SettingsPage({active}: {active:boolean; onGo:(page:Page)=>void}) {
  return (
<section className={active ? "page active" : "page"}><div className="page-intro"><div><div className="eyebrow">Personal workspace</div><h1>Weniger Settings.<br />Mehr Fokus<span style={{ color: "var(--a)" }}>.</span></h1><p>Nur was du tatsächlich einstellen musst. Keys bleiben später serverseitig.</p></div></div><div className="sub-grid"><article><small>CONNECTIONS</small><h3>Garmin Personal API</h3><p>Im Konzept bestätigt: Aktivitäten, RPE/Feeling, HRV, Schlaf, Stress und Body Battery. Diese Demo ist nicht verbunden.</p><div className="empty-line">Garmin: Nicht verbunden (Design-Demo)</div></article><article><small>COACH MODE</small><h3>Aktiver Coach mit Freigabe</h3><p>Der Coach darf proaktiv analysieren und Anpassungen vorschlagen. Nichts wird ohne Zustimmung geändert.</p><label className="toggle"><input type="checkbox" checked={true} disabled={true} /> Coach-Änderungen immer bestätigen</label></article></div></section>
  )
}
