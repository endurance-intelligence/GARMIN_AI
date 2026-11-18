import {POLARIZED_METHOD} from '../lib/polarizedTraining.mjs'
import {Icon} from './Icon'
import '../styles/polarized-method.css'

export function PolarizedMethodCard(){
 return <section className="pol-method" aria-label="Aktive Trainingsmethode Polarisiert">
  <div className="pol-method-top">
   <span className="pol-method-symbol"><Icon name="activity"/></span>
   <div><small>DEINE TRAININGSMETHODE / POLARISIERT</small>
    <strong>Viel locker. Wenig richtig hart.</strong>
    <p>Richtwert: ca. 4 lockere Einheiten auf 1 harte – kein starres 80/20-Soll.</p>
   </div>
  </div>
  <details className="pol-method-explain">
   <summary>So plant dein Coach <Icon name="chevron-down"/></summary>
   <div className="pol-method-zones">
    <p><strong>Locker (unter LT1)</strong><span>Sprechtempo: ganze Sätze möglich. Lange Läufe gehören hierhin.</span></p>
    <p><strong>Mittel (LT1–LT2)</strong><span>Möglichst selten als Dauerzustand; nur gezielt im Renntraining.</span></p>
    <p><strong>Hart (über LT2)</strong><span>Höchstens eine gezielt gewählte Intervalloption pro normaler Woche,
      wenn Training und Erholung passen.</span></p>
   </div>
   <p>In der Rennwoche, nach sehr harten Einheiten oder bei Beschwerden gilt:
    Erholung schlägt die 80/20-Quote. Fußball wird als zusätzliche Belastung berücksichtigt.</p>
   <p>Wir erfinden keine Herzfrequenzgrenzen. Für genaue Zonen müssen LT1/LT2 individuell
    bestimmt sein; bis dahin gilt der Sprechtest als Orientierung.</p>
   <a href={POLARIZED_METHOD.citation} target="_blank" rel="noopener noreferrer">
    Wissenschaftliche Grundlage bei FitCraft <Icon name="arrow-up-right"/>
   </a>
  </details>
 </section>
}
