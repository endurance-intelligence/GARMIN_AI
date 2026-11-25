import {useId} from 'react'
import type {CoachMood} from '../lib/coachPersonality.mjs'
import '../styles/coach-avatar.css'
const expressions={
 neutral:{label:'Aufmerksam',accent:'#a8b8cb',brow:'M42 58l14 -2 M73 56l14 2',eyes:'M47 66h7 M76 66h7',mouth:'M58 83Q65 86 72 83'},
 firm:{label:'Klare Ansage',accent:'#f0bd85',brow:'M41 53l15 6 M73 59l15 -6',eyes:'M46 67h9 M75 67h9',mouth:'M56 84Q65 80 74 84'},
 supportive:{label:'An deiner Seite',accent:'#a8e6c0',brow:'M42 57q7 -5 14 -2 M73 55q7 -3 14 2',eyes:'M46 67q4 -4 9 0 M75 67q4 -4 9 0',mouth:'M55 81Q65 91 75 81'},
 focused:{label:'Fokussiert',accent:'#9dc9fa',brow:'M42 56l14 1 M73 57l14 -1',eyes:'M46 66h9 M75 66h9',mouth:'M58 83h14'},
 reflective:{label:'Nachdenklich',accent:'#c6b6ec',brow:'M42 58q7 -5 14 0 M73 55l14 3',eyes:'M46 67h9 M75 67h9',mouth:'M57 86Q65 80 73 85'},
 celebrate:{label:'Stark umgesetzt',accent:'#d4f78b',brow:'M42 57q7 -5 14 0 M73 57q7 -5 14 0',eyes:'M45 67q5 -8 10 0 M74 67q5 -8 10 0',mouth:'M53 79Q65 99 77 79Z'}
}
export function CoachAvatar({mood='neutral',small=false}:{mood?:CoachMood;small?:boolean}){
 const id=useId().replace(/:/g,''),e=expressions[mood]
 return <div className={'coach-avatar mood-'+mood+(small?' is-small':'')} role="img" aria-label={'Coach · '+e.label}>
  <svg viewBox="0 0 130 140" aria-hidden="true">
   <defs><linearGradient id={id+'bg'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#23374a"/><stop offset="1" stopColor="#101b2a"/></linearGradient><linearGradient id={id+'shirt'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#324f57"/><stop offset="1" stopColor="#17282e"/></linearGradient><clipPath id={id+'clip'}><rect x="1" y="1" width="128" height="138" rx="24"/></clipPath></defs>
   <g clipPath={'url(#'+id+'clip)'}><rect width="130" height="140" fill={'url(#'+id+'bg)'}/>
    <circle cx="65" cy="57" r="47" fill="none" stroke={e.accent} strokeWidth="1" opacity=".26"/><path d="M4 110L34 80M99 36l28 -28M0 128l18 -18" stroke={e.accent} opacity=".18" strokeWidth="2"/>
    <path d="M14 140Q14 108 47 104L52 91h26l5 13q33 4 33 36" fill={'url(#'+id+'shirt)'}/>
    <path d="M51 97l14 16 14 -16 4 8 -18 18 -18 -18Z" fill={e.accent}/><path d="M30 126l8 14M100 126l-8 14" stroke="#0e2029" strokeWidth="4"/>
    <path d="M38 55Q27 54 30 68q2 8 10 8M92 55q11 -1 8 13 -2 8 -10 8" fill="#bf8463" stroke="#302522" strokeWidth="2"/>
    <path d="M36 48Q36 22 65 22t29 26l-2 30Q89 94 65 103 41 94 38 78Z" fill="#dfad87" stroke="#302522" strokeWidth="2"/>
    <path d="M37 53q-8 -17 2 -31 15 -19 40 -14 21 5 20 28l-7 17 -3 -17q-17 2 -38 -8l-12 13Z" fill="#2b3037" stroke="#151b22" strokeWidth="2"/>
    <path d="M30 38Q32 14 58 12t43 19l-9 10q-24 -7 -54 5Z" fill="#e1eee8" stroke="#17272e" strokeWidth="2"/>
    <path d="M58 15q-17 4 -23 19M71 15q17 3 24 17" stroke="#829d96" fill="none" strokeWidth="2"/>
    <path d="M30 42q26 -10 54 -5l24 6q-10 8 -38 2l-26 2Z" fill={e.accent} stroke="#17272e" strokeWidth="2"/>
    <path d="M38 76q4 20 27 26 23 -6 27 -26l-10 13 -7 1 -10 -3 -10 3 -7 -1Z" fill="#68493d" opacity=".6"/>
    <path d={e.brow} fill="none" stroke="#48332e" strokeWidth="3.6" strokeLinecap="round"/>
    <path d={e.eyes} fill="none" stroke="#263039" strokeWidth="3.4" strokeLinecap="round"/>
    <path d="M64 67l-3 8 5 1" stroke="#a86f56" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    <path d={e.mouth} fill={mood==='celebrate'?'#fff7ed':'none'} stroke="#683e35" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M83 125h12m-6 -6v12" stroke={e.accent} strokeWidth="2" strokeLinecap="round"/><path d="M17 138l21 -10M92 131l21 7" stroke={e.accent} opacity=".45" strokeWidth="2"/>
   </g><rect x="1" y="1" width="128" height="138" rx="24" fill="none" stroke={e.accent} strokeOpacity=".65" strokeWidth="2"/>
  </svg>{!small&&<span>{e.label}</span>}
 </div>
}
