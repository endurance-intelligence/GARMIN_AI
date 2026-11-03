import {useState} from 'react'
import {Icon} from './components/Icon'
import {CoachPage} from './pages/CoachPage'
import {TrainingPage} from './pages/TrainingPage'
import {LiveGarminActivities} from './components/LiveGarminActivities'
import {RacePage} from './pages/RacePage'
import {GearPage} from './pages/GearPage'
import {SettingsPage} from './pages/SettingsPage'
import type {Page} from './navigation'
import './styles/horizon.css'

const navigation: {id:Page; name:string; icon:string; mobile:string}[] = [
  {id:'home',name:'Coach',icon:'layout-dashboard',mobile:'Coach'},
  {id:'training',name:'Training',icon:'activity',mobile:'Training'},
  {id:'race',name:'Race Prep',icon:'flag',mobile:'Race'},
  {id:'gear',name:'Equipment',icon:'footprints',mobile:'Gear'},
  {id:'settings',name:'Einstellungen',icon:'settings',mobile:'Settings'}
]

function App() {
  const [page,setPage]=useState<Page>('home')
  function go(next:Page) {setPage(next); window.scrollTo({top:0,behavior:'instant'})}
  return <>
  <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-logo"><Icon name="activity"/></div><div className="brand-copy"><strong>GARMIN<span>_AI</span></strong><small>EAT YOUR MILES</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav" aria-label="Navigation">
        {navigation.map(item=><button type="button" key={item.id} className={page===item.id?'active':''} onClick={()=>go(item.id)}><Icon name={item.icon}/><span>{item.name}</span></button>)}
      </nav>
      <div className="sidebar-fill"/>
      <div className="sidebar-bottom"><span className="micro">● DESIGN LAB / 0.3 REACT</span><p>Nur illustrative Daten.<br/>Keine Garmin-Verbindung.<br/>Dein Plan bleibt unverändert.</p></div>
      <div className="profile"><div className="avatar">DK</div><div><b>Personal workspace</b><span>Single athlete · Local demo</span></div></div>
    </aside>
    <main className="main"><div className="main-in">
      <header className="topbar"><div className="crumbs"><span>WORKSPACE</span><span className="slash">/</span><strong>{navigation.find(n=>n.id===page)?.name}</strong></div><div className="top-actions"><div className="mobile-brand" style={{display:'none'}}><div className="brand-logo"><Icon name="activity"/></div>GARMIN_AI</div><span className="date">DESIGN CONCEPT / NOV 2026</span><span className="pill"><span className="pulse"/> DEMO MODE</span><div className="round-icon"><Icon name="bell"/></div></div></header>
      <CoachPage active={page==='home'} onGo={go}/>
      <TrainingPage active={page==='training'} onGo={go}/>
      <LiveGarminActivities active={page==='training'}/>
      <RacePage active={page==='race'} onGo={go}/>
      <GearPage active={page==='gear'} onGo={go}/>
      <SettingsPage active={page==='settings'} onGo={go}/>
      <div className="footer"><span>GARMIN_AI / HORIZON REACT v0.3.1</span><span>ILLUSTRATIVE DATA · NO LIVE GARMIN ACCESS</span></div>
    </div></main>
  </div>
  <nav className="footmobile" aria-label="Mobile Navigation">
    {navigation.map(item=><button type="button" key={item.id} className={page===item.id?'active':''} onClick={()=>go(item.id)}><Icon name={item.icon}/>{item.mobile}</button>)}
  </nav>
  </>
}
export default App
