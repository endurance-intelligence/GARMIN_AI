import {GarminConnectSnapshot} from '../components/GarminConnectSnapshot'
export function GearPage({active}: {active:boolean; onGo:(page: import('../navigation').Page)=>void}) {
  return <section className={active?'page active':'page'}>
    <div className="page-intro"><div><div className="eyebrow">EQUIPMENT / GARMIN CONNECT</div>
      <h1>Dein Equipment.<br/>Echte Daten.</h1>
      <p>Garmin Connect bleibt die Quelle für Ausrüstung und Zuordnungen. Hier siehst du den zuletzt freigegebenen Datenstand.</p>
    </div></div>
    <GarminConnectSnapshot mode="gear"/>
    <p className="gcs-warning">Keine erfundenen Schuhkilometer: Die historische Zuordnung wird erst angezeigt, wenn sie vollständig eingelesen und verifiziert ist.</p>
  </section>
}
