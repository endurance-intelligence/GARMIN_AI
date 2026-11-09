/** Pure value logic: one-tenth kilogram precision, safe 30–300 kg. */
export function weightFromParts(whole:string,decimal:string):string {
  if(!/^\d{2,3}$/.test(whole)||!/^\d$/.test(decimal))return ''
  const kg=Number(whole),fraction=Number(decimal)
  if(!Number.isSafeInteger(kg)||kg<30||kg>300||(kg===300&&fraction!==0))return ''
  return kg+'.'+fraction
}
export function weightToParts(raw:string):{whole:string;decimal:string} {
  if(!raw.trim())return {whole:'',decimal:'0'}
  const value=Number(raw.replace(',','.'))
  if(!Number.isFinite(value)||value<30||value>300)
    return {whole:'',decimal:'0'}
  const decigrams=Math.round(value*10)
  return {whole:String(Math.floor(decigrams/10)),decimal:String(decigrams%10)}
}
