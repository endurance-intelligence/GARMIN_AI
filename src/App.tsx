import {useState} from 'react'
import {OnlineAccessGate} from './components/OnlineAccessGate'
import {Icon} from './components/Icon'
import {CoachPage} from './pages/CoachPage'
import {TrainingPage} from './pages/TrainingPage'
import {CalendarPage} from './pages/CalendarPage'
import {MorePage} from './pages/MorePage'
import {LiveGarminActivities} from './components/LiveGarminActivities'
import {RacePage} from './pages/RacePage'
import {GearPage} from './pages/GearPage'
import {SettingsPage} from './pages/SettingsPage'
import {StrengthPage} from './pages/StrengthPage'
import type {Page} from './navigation'
import './styles/horizon.css'
import './styles/mobile-first.css'
import './styles/mobile-ux-v084.css'

const navigation: {id:Page; name:string; icon:string; mobile:string}[] = [
  {id:'home',name:'Coach',icon:'layout-dashboard',mobile:'Coach'},
  {id:'calendar',name:'Kalender',icon:'calendar-days',mobile:'Kalender'},
  {id:'training',name:'Analyse',icon:'activity',mobile:'Training'},
  {id:'race',name:'Race Prep',icon:'flag',mobile:'Race'},
  {id:'more',name:'Mehr',icon:'more-horizontal',mobile:'Mehr'}
]
const navActive=(page:Page,id:Page)=>page===id||
  (id==='more'&&(page==='gear'||page==='settings'||page==='strength'))

function App() {
  const [page,setPage]=useState<Page>(()=>{
   try{
    const last=sessionStorage.getItem('garmin-ai:last-page:v1')
    if(last&&(['home','calendar','training','race','more','gear','settings','strength'] as string[]).includes(last))
     return last as Page
   }catch{/* Private browsing can block session storage. */}
   return 'home'
  })
  function go(next:Page) {
    setPage(next)
    try{sessionStorage.setItem('garmin-ai:last-page:v1',next)}catch{}
    window.scrollTo({top:0,behavior:'instant'})
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
      <div className="sidebar-bottom"><span className="micro">● DESIGN LAB / 0.3 REACT</span><p>Garmin-Daten via Supabase.<br/>Coach derzeit teilweise Demo.<br/>Planänderungen nur nach Freigabe.</p></div>
      <div className="profile"><div className="avatar">DK</div><div><b>Personal workspace</b><span>Single athlete · Privat</span></div></div>
    </aside>
    <main className="main"><div className="main-in">
      <header className="topbar"><div className="crumbs"><span>WORKSPACE</span><span className="slash">/</span><strong>{(page==='gear'?'Equipment':page==='settings'?'Einstellungen':page==='strength'?'Stabi Studio':navigation.find(n=>n.id===page)?.name)}</strong></div><div className="top-actions"><div className="mobile-brand" style={{display:'none'}}><div className="brand-logo"><Icon name="activity"/></div>GARMIN_AI</div><span className="date">DESIGN CONCEPT / NOV 2026</span><span className="pill"><span className="pulse"/> LIVE DATA · COACH DEMO</span><div className="round-icon"><Icon name="bell"/></div></div></header>
      <CoachPage active={page==='home'} onGo={go}/>
      <CalendarPage active={page==='calendar'}/>
      <TrainingPage active={page==='training'} onGo={go}/>
      <StrengthPage active={page==='strength'}/>
      {import.meta.env.DEV && <LiveGarminActivities active={page==='training'}/>}
      <RacePage active={page==='race'} onGo={go}/>
      <GearPage active={page==='gear'} onGo={go}/>
      <SettingsPage active={page==='settings'} onGo={go}/>
      <MorePage active={page==='more'} onGo={go}/>
      <div className="footer"><span>GARMIN_AI / HORIZON REACT v0.3.1</span><span>ECHTE GARMIN-DATEN · COACH TEILWEISE DEMO</span></div>
    </div></main>
  </div>
  <nav className="footmobile" aria-label="Mobile Navigation">
    {navigation.map(item=><button type="button" key={item.id} className={navActive(page,item.id)?'active':''} aria-current={navActive(page,item.id)?'page':undefined} onClick={()=>go(item.id)}><Icon name={item.icon}/>{item.mobile}</button>)}
  </nav>
  </OnlineAccessGate>
}
export default App
