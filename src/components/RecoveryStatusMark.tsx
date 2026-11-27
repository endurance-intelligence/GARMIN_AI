import type {RecoveryStatus} from '../lib/recoveryStatus.mjs'
export function RecoveryStatusMark({status}:{status:RecoveryStatus}){
 return <span className={'co-metric-status '+status.tone} title="Orientierung am persönlichen Vergleichswert, keine medizinische Bewertung"><span aria-hidden="true">{status.emoji}</span> {status.label}</span>
}
