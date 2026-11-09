/**
 * Native iOS-friendly wheel selection for daily Garmin_AI weight entry.
 * Two native <select> controls invoke the platform picker on iPhone.
 * No custom pointer gestures, extra dependencies or backend writes.
 */
import './WeightWheelPicker.css'

const kilograms=Array.from({length:271},(_,index)=>30+index)
const tenths=Array.from({length:10},(_,index)=>index)

export function weightFromParts(whole:string,decimal:string):string {
  if(!/^\d{2,3}$/.test(whole)||!/^\d$/.test(decimal))return ''
  const kg=Number(whole),fraction=Number(decimal)
  if(!Number.isSafeInteger(kg)||kg<30||kg>300||(kg===300&&fraction!==0))return ''
  return kg+'.'+fraction
}

export function WeightWheelPicker({value,onChange,disabled=false}:{
  value:string;onChange:(next:string)=>void;disabled?:boolean
}) {
  const current=Number(value.replace(',','.'))
  const valid=value.trim()!==''&&Number.isFinite(current)&&current>=30&&current<=300
  const whole=valid?String(Math.floor(current)):''
  const decimal=valid?String(Math.min(9,Math.round((current-Math.floor(current))*10))):'0'

  return <div className="weight-wheel" role="group" aria-label="Gewicht in Kilogramm auswählen">
    <div className="weight-wheel-pickers">
      <label className="weight-wheel-field">
        <span>Ganze kg</span>
        <select aria-label="Ganze Kilogramm auswählen" value={whole}
          disabled={disabled}
          onChange={event=>{
            const nextWhole=event.target.value
            onChange(nextWhole?weightFromParts(nextWhole,nextWhole==='300'?'0':decimal):'')
          }}>
          <option value="">kg wählen</option>
          {kilograms.map(kg=><option key={kg} value={kg}>{kg}</option>)}
        </select>
      </label>
      <span className="weight-wheel-comma" aria-hidden="true">,</span>
      <label className="weight-wheel-field weight-wheel-decimal">
        <span>Nachkomma</span>
        <select aria-label="Zehntel Kilogramm auswählen" value={whole==='300'?'0':decimal}
          disabled={disabled||!whole||whole==='300'}
          onChange={event=>onChange(weightFromParts(whole,event.target.value))}>
          {tenths.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <span className="weight-wheel-unit" aria-hidden="true">kg</span>
    </div>
    <small className="weight-wheel-help">Tippe auf die Werte und wische im iPhone-Auswahlrad. Genauigkeit: 0,1 kg.</small>
  </div>
}
