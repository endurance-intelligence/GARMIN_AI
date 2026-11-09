/**
 * GARMIN_AI v0.8.3 - one elegant weight control + an iPhone/iPad touch sheet.
 * The two independent scroll-snap wheels avoid 2700 individual options and
 * never write to Garmin or Supabase without the existing Save button.
 */
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {KeyboardEvent as ReactKeyboardEvent,UIEvent} from 'react'
import {createPortal} from 'react-dom'
import {weightFromParts,weightToParts} from '../lib/weightPickerMath'
import './WeightWheelPicker.css'

const wholeValues=Array.from({length:271},(_,i)=>String(30+i))
const fractionValues=Array.from({length:10},(_,i)=>String(i))
const ROW=48

function formatWeight(value:string):string {
  const {whole,decimal}=weightToParts(value)
  return whole?whole+','+decimal:''
}
function WheelColumn({label,values,value,onChange}:{
  label:string;values:string[];value:string;onChange:(value:string)=>void
}) {
  const scroll=useRef<HTMLDivElement|null>(null)
  const last=useRef(-1)
  useLayoutEffect(()=>{
    const index=Math.max(0,values.indexOf(value))
    last.current=index
    if(scroll.current)scroll.current.scrollTop=index*ROW
    // Initialized only when the sheet is mounted; user gestures own subsequent position.
  },[])
  function select(index:number,smooth=false) {
    const i=Math.max(0,Math.min(values.length-1,index))
    if(i!==last.current){last.current=i;onChange(values[i])}
    scroll.current?.scrollTo({top:i*ROW,behavior:smooth?'smooth':'auto'})
  }
  function onScroll(event:UIEvent<HTMLDivElement>){
    const index=Math.max(0,Math.min(values.length-1,Math.round(event.currentTarget.scrollTop/ROW)))
    if(index!==last.current){last.current=index;onChange(values[index])}
  }
  function onKeys(event:ReactKeyboardEvent<HTMLDivElement>){
    const i=values.indexOf(value)
    if(event.key==='ArrowDown'){event.preventDefault();select(i+1,true)}
    if(event.key==='ArrowUp'){event.preventDefault();select(i-1,true)}
    if(event.key==='Home'){event.preventDefault();select(0,true)}
    if(event.key==='End'){event.preventDefault();select(values.length-1,true)}
  }
  return <div className="weight-sheet-column">
    <span className="weight-sheet-column-title">{label}</span>
    <div className="weight-sheet-track">
      <div className="weight-sheet-selection" aria-hidden="true"/>
      <div className="weight-sheet-scroller" ref={scroll} onScroll={onScroll}
        role="listbox" aria-label={label} aria-orientation="vertical"
        tabIndex={0} onKeyDown={onKeys}>
        {values.map((item,i)=><div key={item} role="option" aria-selected={item===value}
          className={'weight-sheet-option'+(item===value?' selected':'')}
          onClick={()=>select(i,true)}>
          {item}
        </div>)}
      </div>
    </div>
  </div>
}

export function WeightWheelPicker({value,onChange,disabled=false}:{
  value:string;onChange:(value:string)=>void;disabled?:boolean
}) {
  const [open,setOpen]=useState(false)
  const [whole,setWhole]=useState('75')
  const [fraction,setFraction]=useState('0')
  const trigger=useRef<HTMLButtonElement|null>(null)
  const formatted=formatWeight(value)

  function show() {
    if(disabled)return
    const parts=weightToParts(value)
    setWhole(parts.whole||'75')
    setFraction(parts.decimal)
    setOpen(true)
  }
  function close() {
    setOpen(false)
    requestAnimationFrame(()=>trigger.current?.focus())
  }
  function choose(){
    const next=weightFromParts(whole,whole==='300'?'0':fraction)
    if(next)onChange(next)
    close()
  }

  useEffect(()=>{
    if(!open)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}
    }
    window.addEventListener('keydown',onKey)
    return ()=>{
      document.body.style.overflow=previous
      window.removeEventListener('keydown',onKey)
    }
  },[open])

  return <div className="weight-control">
    <button type="button" className="weight-control-trigger" ref={trigger}
      aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={show}>
      <span className="weight-control-value">{formatted||'Gewicht wählen'}{formatted&&<span className="weight-control-unit">kg</span>}</span>
      <span className="weight-control-arrow" aria-hidden="true">⌄</span>
    </button>
    <small className="weight-control-help">Antippen und durch die Zahlen wischen · 0,1 kg</small>
    {open&&createPortal(<div className="weight-sheet-backdrop"
      onPointerDown={event=>{if(event.currentTarget===event.target)close()}}>
      <section className="weight-sheet" role="dialog" aria-modal="true"
        aria-label="Gewicht auswählen">
        <header className="weight-sheet-header">
          <div><span className="weight-sheet-eyebrow">GEWICHT</span>
            <h3>Wie viel wiegst du?</h3>
            <p>Nach oben oder unten wischen</p>
          </div>
          <button type="button" className="weight-sheet-close" onClick={close}
            aria-label="Auswahl schließen">×</button>
        </header>
        <div className="weight-sheet-preview" aria-live="off">
          {whole}<span>,{whole==='300'?'0':fraction}</span><small> kg</small>
        </div>
        <div className="weight-sheet-columns">
          <WheelColumn label="Kilogramm" values={wholeValues}
            value={whole} onChange={next=>{
              setWhole(next)
              if(next==='300')setFraction('0')
            }}/>
          <span className="weight-sheet-separator" aria-hidden="true">,</span>
          <WheelColumn label="Zehntel" values={whole==='300'?['0']:fractionValues}
            value={whole==='300'?'0':fraction} onChange={setFraction}/>
        </div>
        <div className="weight-sheet-actions">
          <button type="button" className="weight-sheet-cancel" onClick={close}>Abbrechen</button>
          <button type="button" className="weight-sheet-apply" onClick={choose}>
            Übernehmen
          </button>
        </div>
        <p className="weight-sheet-footnote">Die Auswahl wird erst mit „Gewicht speichern“ in GARMIN_AI gespeichert.</p>
      </section>
    </div>,document.body)}
  </div>
}
