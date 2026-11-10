import {Icon} from '../components/Icon'
import type {Page} from '../navigation'
import '../styles/horizon-calendar.css'

export function MorePage({active,onGo}:{active:boolean;onGo:(page:Page)=>void}){
 return <section className={active?'page active':'page'}>
  <div className="hc-intro">
   <div className="hc-eyebrow"><span className="hc-pulse"/> GARMIN_AI / DEIN WORKSPACE</div>
   <h1>Alles andere.<br/><span>Gut organisiert.</span></h1>
   <p>Deine Ausrüstung, Garmin-Verbindungen und Einstellungen – dort, wo du sie brauchst.</p>
  </div>
  <div className="hc-more-grid">
   <button type="button" className="hc-more-link" onClick={()=>onGo('gear')}>
    <span className="hc-more-symbol"><Icon name="footprints"/></span>
    <span><strong>Equipment</strong><small>Laufschuhe, Garmin-Zuordnungen und Kilometerstände</small></span>
    <span className="hc-more-chevron">›</span>
   </button>
   <button type="button" className="hc-more-link" onClick={()=>onGo('strength')}>
    <span className="hc-more-symbol"><Icon name="dumbbell"/></span>
    <span><strong>Stabi Studio</strong><small>26 Übungen aus Endurance Intelligence · Mobility · Rudertraining</small></span>
    <span className="hc-more-chevron">›</span>
   </button>
   <button type="button" className="hc-more-link" onClick={()=>onGo('settings')}>
    <span className="hc-more-symbol"><Icon name="settings"/></span>
    <span><strong>Einstellungen</strong><small>Synchronisierung, Konto und Herzfrequenzzonen</small></span>
    <span className="hc-more-chevron">›</span>
   </button>
  </div>
  <p className="hc-footnote">Garmin Connect bleibt die externe Datenquelle. Dein Coach bestätigt geplante Änderungen nur mit deiner Freigabe.</p>
 </section>
}
