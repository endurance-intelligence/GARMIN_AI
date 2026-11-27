import type {RecoveryStatus} from '../lib/recoveryStatus.mjs'
export function RecoveryStatusMark({status}:{status:RecoveryStatus}){
 const caption=status.label==='Längerfristig niedriger'?'Vergleich: letzte 7 Tage mit früheren eigenen Werten (Tag 14–89)':status.label==='Kein Vergleich'?'Persönliche Vergleichswerte werden gesammelt':status.label==='Kein Messwert'||status.label==='Nicht aktuell'?'Persönlicher Vergleich derzeit nicht möglich':'Vergleich mit deinen eigenen Werten der vorherigen 14 Tage'
 return <div style={{minWidth:0}}>
  <span className={'co-metric-status '+status.tone} title="Orientierung am persönlichen Vergleichswert, keine medizinische Bewertung"><span aria-hidden="true">{status.emoji}</span> {status.label}</span>
  <small className="co-metric-reference" style={{display:'block',fontSize:'.72rem',lineHeight:1.3,opacity:.8,marginTop:4,overflowWrap:'anywhere'}}>{caption}</small>
 </div>
}
