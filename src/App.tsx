import {useState} from 'react'
import {OnlineAccessGate} from './components/OnlineAccessGate'
import {Icon} from './components/Icon'
import {CoachPage} from './pages/CoachPage'
import {TrainingPage} from './pages/TrainingPage'
import {CalendarPage} from './pages/CalendarPage'
import {MorePage} from './pages/MorePage'
import {LiveGarminActivities} from './components/LiveGarminActivities'
import {RacePage} from './pages/RacePage'
import {GoalsPage} from './pages/GoalsPage'
import {GearPage} from './pages/GearPage'
import {SettingsPage} from './pages/SettingsPage'
import {StrengthPage} from './pages/StrengthPage'
import type {Page} from './navigation'
import './styles/horizon.css'
import './styles/mobile-first.css'
import './styles/mobile-ux-v084.css'
import './styles/navigation-goals.css'

const navigation: {id:Page; name:string; icon:string; mobile:string}[] = [
  {id:'home',name:'Coach',icon:'layout-dashboard',mobile:'Coach'},
  {id:'goals',name:'Goals',icon:'target',mobile:'Goals'},
  {id:'calendar',name:'Kalender',icon:'calendar-days',mobile:'Kalender'},
  {id:'training',name:'Analyse',icon:'activity',mobile:'Training'},
  {id:'race',name:'Race Prep',icon:'flag',mobile:'Race'},
  {id:'more',name:'Mehr',icon:'more-horizontal',mobile:'Mehr'}
]
const navActive=(page:Page,id:Page)=>page===id||
  (id==='more'&&(page==='gear'||page==='settings'||page==='strength'))

function App() {
  const [calendarFocus,setCalendarFocus]=useState<{date:string;token:number}|null>(null)
  const [coachFocus,setCoachFocus]=useState<{date:string;token:number}|null>(null)
  const [raceWeatherFocus,setRaceWeatherFocus]=useState(0)
  const [sessionFocus,setSessionFocus]=useState<{activityId:string;token:number}|null>(null)
  const [page,setPage]=useState<Page>(()=>{
   try{
    const last=sessionStorage.getItem('garmin-ai:last-page:v1')
    if(last&&(['home','goals','calendar','training','race','more','gear','settings','strength'] as string[]).includes(last))
     return last as Page
   }catch{/* Private browsing can block session storage. */}
   return 'home'
  })
  function go(next:Page) {
    setPage(next)
    try{sessionStorage.setItem('garmin-ai:last-page:v1',next)}catch{}
    window.scrollTo({top:0,behavior:'instant'})
  }
  function openCoach(date?:string){
    if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))
      setCoachFocus(prev=>({date,token:(prev?.token||0)+1}))
    openCalendar(date)
  }
  function openSession(activityId:string){
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(activityId))return
    setSessionFocus(prev=>({activityId,token:(prev?.token||0)+1}))
    go('training')
  }
  function openRaceWeather(){
    setRaceWeatherFocus(n=>n+1)
    go('race')
  }
  function openCalendar(date?:string){
    if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))
      setCalendarFocus(prev=>({date,token:(prev?.token||0)+1}))
    go('calendar')
  }
  return <OnlineAccessGate>
  <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-logo"><Icon name="activity"/></div><div className="brand-copy"><strong>GARMIN<span>_AI</span></strong><small>EAT YOUR MILES</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav" aria-label="Navigation">
        {navigation.map(item=><button type="button" key={item.id} className={navActive(page,item.id)?'active':''} aria-current={navActive(page,item.id)?'page':undefined} onClick={()=>go(item.id)}><Icon name={item.icon}/><span>{item.name}</span></button>)}
      </nav>
      <div className="sidebar-fill"/>
      <div className="sidebar-bottom"><span className="micro">● GARMIN_AI / PERSÖNLICHER COACH</span><p>Garmin-Daten live.<br/>Coach-Empfehlungen prüfbar.<br/>Planänderungen nur nach Freigabe.</p></div>
      <div className="profile"><div className="avatar">DK</div><div><b>Personal workspace</b><span>Single athlete · Privat</span></div></div>
    </aside>
    <main className="main"><div className="main-in">
      <header className="topbar"><div className="crumbs"><span>WORKSPACE</span><span className="slash">/</span><strong>{(page==='gear'?'Equipment':page==='settings'?'Einstellungen':page==='strength'?'Stabi Studio':navigation.find(n=>n.id===page)?.name)}</strong></div><div className="top-actions"><div className="mobile-brand" style={{display:'none'}}><div className="brand-logo"><Icon name="activity"/></div>GARMIN_AI</div><span className="date">GARMIN_AI / DEIN TRAINING</span><span className="pill"><span className="pulse"/> DATEN LIVE · FREIGABE DURCH DICH</span><div className="round-icon"><Icon name="bell"/></div></div></header>
      <CoachPage active={page==='home'} onGo={go} onOpenCalendar={openCalendar} onOpenDecision={openCoach}/>
      <CalendarPage active={page==='calendar'} focus={calendarFocus} decisionFocus={coachFocus} onOpenCoach={openCoach} onGo={go} onOpenSession={openSession}/>
      <GoalsPage active={page==='goals'} onGo={go} onOpenRaceWeather={openRaceWeather}/>
      <TrainingPage active={page==='training'} onGo={go} focus={sessionFocus} onOpenSession={openSession} onOpenCalendar={openCalendar}/>
      <StrengthPage active={page==='strength'}/>
      {import.meta.env.DEV && <LiveGarminActivities active={page==='training'}/>}
      <RacePage active={page==='race'} onGo={go} focusWeatherToken={raceWeatherFocus}/>
      <GearPage active={page==='gear'} onGo={go}/>
      <SettingsPage active={page==='settings'} onGo={go}/>
      <MorePage active={page==='more'} onGo={go}/>
      <div className="footer"><span>GARMIN_AI / PERSONAL TRAINING</span><span>GARMIN-DATEN · COACH MIT DEINER FREIGABE</span></div>
    </div></main>
  </div>
  <nav className="footmobile" aria-label="Mobile Navigation">
    {navigation.map(item=><button type="button" key={item.id} className={navActive(page,item.id)?'active':''} aria-current={navActive(page,item.id)?'page':undefined} onClick={()=>go(item.id)}><Icon name={item.icon}/>{item.mobile}</button>)}
  </nav>
  </OnlineAccessGate>
}
export default App
