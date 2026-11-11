import {useEffect,useRef,useState} from 'react'

export type VenueSuggestion={
 name:string;city:string;address:string|null;subtitle:string;source:string;hasFullAddress:boolean
}
export function VenueAutocomplete({value,city,disabled,onChange,onPick,request}:{
 value:string;city:string;disabled?:boolean;
 onChange:(value:string)=>void;onPick:(suggestion:VenueSuggestion)=>void;
 request:(query:string,city:string)=>Promise<VenueSuggestion[]>
}){
 const [suggestions,setSuggestions]=useState<VenueSuggestion[]>([])
 const [searching,setSearching]=useState(false)
 const [focused,setFocused]=useState(false)
 const [message,setMessage]=useState('')
 const sequence=useRef(0)
 const [confirmed,setConfirmed]=useState<string|null>(null)
 useEffect(()=>{
  if(disabled||!focused||value.trim().length<4||value===confirmed){
   setSuggestions([]);setSearching(false);return
  }
  const n=++sequence.current
  setSearching(true);setMessage('')
  const timer=setTimeout(()=>{
   void request(value.trim(),city).then(items=>{
    if(sequence.current===n){setSuggestions(items);setMessage(items.length?'':'Kein passender Ort gefunden.')}
   }).catch(e=>{
    if(sequence.current===n){setSuggestions([]);setMessage(
      e instanceof Error?e.message:'Keine Ortsvorschläge verfügbar.')}
   }).finally(()=>{if(sequence.current===n)setSearching(false)})
  },750)
  return ()=>{clearTimeout(timer);sequence.current++}
 },[value,city,disabled,focused,confirmed,request])
 const select=(item:VenueSuggestion)=>{
  sequence.current++
  setConfirmed(item.address||item.name)
  setSuggestions([]);setFocused(false);setMessage('')
  onPick(item)
 }
 return <div className="rer-autocomplete">
  <input type="text" value={value} disabled={disabled} autoComplete="off" spellCheck={false}
   aria-label="Adresse suchen oder eingeben" aria-autocomplete="list"
   aria-expanded={focused&&suggestions.length>0}
   placeholder="Ort oder Straße tippen, z. B. Sportpark"
   onChange={e=>{setConfirmed(null);onChange(e.target.value)}}
   onFocus={()=>setFocused(true)}
   onBlur={()=>{setTimeout(()=>setFocused(false),120)}}/>
  {focused&&(searching||suggestions.length>0||message)&&
   <div className="rer-suggest-list" role="listbox" aria-label="Gefundene Veranstaltungsorte">
    {searching&&<div className="rer-suggest-status">Suche Orte in {city||'der Umgebung'} …</div>}
    {!searching&&suggestions.map((item,i)=>
     <button role="option" aria-selected={false} key={item.source+'-'+i} type="button"
      onPointerDown={e=>e.preventDefault()} onClick={()=>select(item)}>
      <span><b>{item.name}</b><small>{item.subtitle||item.city}</small></span>
      <span className="rer-suggest-origin">{item.hasFullAddress?'Adresse ✓':'Ort'}</span>
     </button>)}
    {!searching&&message&&<div className="rer-suggest-status">{message}</div>}
   </div>}
  <small className="rer-suggest-help">Ab 4 Zeichen erscheinen Vorschläge. Auswählen übernimmt nur Ort, Stadt und eine vorhandene vollständige Adresse.</small>
 </div>
}
