import {useEffect,useMemo,useState} from 'react'
import {garminSupabase} from '../lib/garminSupabase'
import {buildGelPlan} from '../lib/gelTiming.mjs'
import {buildAidPlan} from '../lib/raceAidPlan.mjs'
import {buildRaceFuelRoadmap} from '../lib/raceFuelRoadmap.mjs'
import {eventMenuForRace} from '../lib/raceEventMenu.mjs'
import type {AidPlanEvent} from '../lib/raceAidPlan.mjs'
import type {RaceCheckpoint} from '../lib/raceExecution.mjs'
import type {GelStock,GelPlanEvent} from '../lib/gelTiming.mjs'
import type {CoachGoal} from '../lib/coachGoal'
import {Icon} from './Icon'
import '../styles/gel-inventory.css'

type Brand='Maurten'|'SiS'|'226ERS'|'Eigene'
type Product={id:string;brand:string;name:string;flavor:string;carbs_g:number|null;
 caffeine_mg:number|null;sodium_mg:number|null;serving_g:number|null;
 official_url:string;is_bulk:boolean;active:boolean}
type Inventory={id:string;user_id:string;catalog_id:string|null;
 custom_brand:string|null;custom_name:string|null;custom_carbs_g:number|null;
 custom_caffeine_mg:number|null;custom_sodium_mg:number|null;
 flavor_note:string;quantity:number;priority:number;note:string}
type Settings={drink_carbs_g_per_hour:number;allow_caffeine:boolean;
 aid_confirmed:boolean;aid_every_laps:number;aid_drink_mix:'unknown'|'160'|'320'|'custom';
 aid_drink_ml_per_stop:number;aid_custom_carbs_g_per_500:number;
 aid_food_name:string;aid_food_carbs_g_per_stop:number;
 caffeine_start_minute:number;caffeine_max_mg:number}
const initialSettings:Settings={drink_carbs_g_per_hour:0,allow_caffeine:false,
 aid_confirmed:false,aid_every_laps:1,aid_drink_mix:'unknown',aid_drink_ml_per_stop:0,
 aid_custom_carbs_g_per_500:0,aid_food_name:'',aid_food_carbs_g_per_stop:0,
 caffeine_start_minute:360,caffeine_max_mg:100}
const priorities=['','❤ Favorit','✓ Gut verträglich','⚠ Notfallreserve'] as const
const brands:Brand[]=['Maurten','SiS','226ERS','Eigene']
const fmt=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const num=(n:unknown)=>n===null||n===undefined?null:Number(n)
const clampInt=(n:number,min:number,max:number)=>Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):min
function display(p:Product){return p.name+' · '+p.flavor+' · '+
 (p.carbs_g===null?'KH noch nicht verifiziert':fmt(Number(p.carbs_g))+' g KH')+
 (Number(p.caffeine_mg)>0?' · '+p.caffeine_mg+' mg Koffein':'')}
export function GelInventoryPlanner({active,goal,durationMinutes,carbsGPerHour,
 checkpoints,onScheduleChange,onAidScheduleChange}:{
 active:boolean;goal:CoachGoal;durationMinutes:number|null;carbsGPerHour:number|null;
 checkpoints?:RaceCheckpoint[];
 onScheduleChange?:(events:GelPlanEvent[]|null)=>void;
 onAidScheduleChange?:(events:AidPlanEvent[]|null)=>void
}){
 const [catalog,setCatalog]=useState<Product[]>([])
 const [inventory,setInventory]=useState<Inventory[]>([])
 const [userId,setUserId]=useState('')
 const [brand,setBrand]=useState<Brand>('Maurten')
 const [productId,setProductId]=useState('')
 const [flavorNote,setFlavorNote]=useState('')
 const [quantity,setQuantity]=useState(2)
 const [priority,setPriority]=useState(1)
 const [customBrand,setCustomBrand]=useState('')
 const [customName,setCustomName]=useState('')
 const [customCarbs,setCustomCarbs]=useState('')
 const [customCaffeine,setCustomCaffeine]=useState('0')
 const [customSodium,setCustomSodium]=useState('')
 const [settings,setSettings]=useState<Settings>(()=>({...initialSettings,
  aid_drink_mix:eventMenuForRace({raceName:goal.race_name,raceDate:goal.race_date})?'160':'unknown'}))
 const [settingsDirty,setSettingsDirty]=useState(false)
 const changeSettings=(patch:Partial<Settings>)=>{
  setSettings(s=>({...s,...patch}));setSettingsDirty(true)
 }
 const [busy,setBusy]=useState('')
 const [loading,setLoading]=useState(true)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const [confirmRemove,setConfirmRemove]=useState('')
 const [loadedKey,setLoadedKey]=useState('')
 const key=goal.race_date+'|'+goal.race_name
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let live=true
  setLoading(true);setError('')
  void (async()=>{
   const {data:{session},error:authError}=await garminSupabase.auth.getSession()
   if(authError||!session)throw Error('Für deine Gel-Liste bitte anmelden.')
   const [products,owned,prefs]=await Promise.all([
    garminSupabase.from('garmin_gel_catalog').select('*').eq('active',true)
     .order('brand').order('name').order('flavor'),
    garminSupabase.from('garmin_gel_inventory').select('*')
     .eq('user_id',session.user.id).order('priority').order('updated_at',{ascending:false}),
    garminSupabase.from('garmin_gel_plan_settings').select('*')
     .eq('user_id',session.user.id).eq('race_date',goal.race_date)
     .eq('race_name',goal.race_name).maybeSingle()
   ])
   if(products.error)throw Error('Gel-Katalog: '+products.error.message)
   if(owned.error)throw Error('Dein Gel-Vorrat: '+owned.error.message)
   if(prefs.error)throw Error('Gel-Einstellungen: '+prefs.error.message)
   if(!live)return
   setUserId(session.user.id)
   setCatalog((products.data||[]) as Product[])
   setInventory((owned.data||[]) as Inventory[])
   const confirmed160=Boolean(eventMenuForRace({raceName:goal.race_name,raceDate:goal.race_date}))
   setSettings({...initialSettings,...prefs.data,
    aid_drink_mix:confirmed160?'160':prefs.data?.aid_drink_mix||'unknown',
    drink_carbs_g_per_hour:Number(prefs.data?.drink_carbs_g_per_hour||0),
    allow_caffeine:Boolean(prefs.data?.allow_caffeine)})
   // Never auto-publish changed carb math from conflicting old settings.
   setSettingsDirty(Boolean(confirmed160&&prefs.data&&prefs.data.aid_drink_mix!=='160'))
   setLoadedKey(key)
  })().catch(e=>{if(live)setError(e instanceof Error?e.message:'Gel-Daten nicht verfügbar')})
   .finally(()=>{if(live)setLoading(false)})
  return ()=>{live=false}
 },[active,goal.race_date,goal.race_name,key])
 const options=catalog.filter(p=>p.brand===brand)
 const byId=useMemo(()=>new Map(catalog.map(p=>[p.id,p])),[catalog])
 const selected=options.find(p=>p.id===productId)
 const stock:GelStock[]=useMemo(()=>inventory.map(item=>{
  const p=item.catalog_id?byId.get(item.catalog_id):null
  return {id:item.id,brand:p?.brand||item.custom_brand||'Eigene',
   name:p?.name||item.custom_name||'Eigenes Gel',
   flavor:[p?.flavor||'',item.flavor_note||''].filter(Boolean).join(' · '),
   carbsG:num(p?.carbs_g??item.custom_carbs_g)??NaN,
   caffeineMg:num(p?.caffeine_mg??item.custom_caffeine_mg),
   quantity:item.quantity,priority:item.priority,isBulk:Boolean(p?.is_bulk)}
 }),[inventory,byId])
 const eventMenu=eventMenuForRace({raceName:goal.race_name,raceDate:goal.race_date})
 const checkpointKey=JSON.stringify((checkpoints||[]).map(c=>[c.index,c.arrivalMinutes,c.finish]))
 const aidPlan=useMemo(()=>buildAidPlan({checkpoints,settings,startTime:goal.race_start_time}),
  [checkpointKey,settings,goal.race_start_time])
 const racePlan=useMemo(()=>buildGelPlan({
  durationMinutes:durationMinutes||0,targetCarbsGPerHour:carbsGPerHour??0,
  drinkCarbsGPerHour:Number(settings.drink_carbs_g_per_hour),
  allowCaffeine:settings.allow_caffeine,inventory:stock,startTime:goal.race_start_time,
  aidEvents:aidPlan.status==='ready'?aidPlan.events:[],
  caffeineStartMinute:settings.caffeine_start_minute,
  caffeineMaxMg:settings.caffeine_max_mg
 }),[durationMinutes,carbsGPerHour,settings,stock,goal.race_start_time,aidPlan])
 const roundRoadmap=useMemo(()=>buildRaceFuelRoadmap({
  checkpoints,
  gelEvents:racePlan.status==='ready'?racePlan.events:null,
  aidEvents:aidPlan.status==='ready'?aidPlan.events:null,
  eventMenu
 }),[checkpointKey,racePlan,aidPlan,eventMenu])
 useEffect(()=>{
  if(!onScheduleChange||settingsDirty)return // keep last saved schedule while editing
  onScheduleChange(!loading&&loadedKey===key&&racePlan.status==='ready'?
   racePlan.events:null)
 },[onScheduleChange,loading,loadedKey,key,racePlan,settingsDirty])
 useEffect(()=>{
  if(!onAidScheduleChange||settingsDirty)return // no unsaved aid in Runner Mode
  onAidScheduleChange(!loading&&loadedKey===key&&aidPlan.status==='ready'?
   aidPlan.events:null)
 },[onAidScheduleChange,loading,loadedKey,key,aidPlan,settingsDirty])
 const ordered=[...inventory].sort((a,b)=>a.priority-b.priority||
  (byId.get(a.catalog_id||'')?.brand||a.custom_brand||'').localeCompare(
  byId.get(b.catalog_id||'')?.brand||b.custom_brand||''))
 const totalStock=inventory.reduce((n,x)=>n+Number(x.quantity||0),0)
 async function addGel(){
  if(busy||!garminSupabase||!userId)return
  setError('');setNotice('')
  const count=clampInt(quantity,0,500)
  if(count<1){setError('Bitte mindestens ein Gel als vorhandene Menge wählen.');return}
  if(brand!=='Eigene'&&!selected){setError('Bitte ein konkretes Gel auswählen.');return}
  if(brand==='Eigene'&&(!customName.trim()||!customBrand.trim()||
   !Number.isFinite(Number(customCarbs))||Number(customCarbs)<=0||
   Number(customCarbs)>250)){
   setError('Für eigene Gels bitte Hersteller, Produkt und KH je Gel korrekt eintragen.')
   return
  }
  const hasNum=(text:string)=>text.trim()!==''&&Number.isFinite(Number(text))
  if(brand==='Eigene'&&((hasNum(customCaffeine)&&Number(customCaffeine)>500)||
   (hasNum(customSodium)&&Number(customSodium)>3000)||
   (customCaffeine.trim()&&!hasNum(customCaffeine))||
   (customSodium.trim()&&!hasNum(customSodium)))){
   setError('Koffein und Natrium bitte in mg je Gel prüfen.');return
  }
  const payload={
   user_id:userId,catalog_id:brand==='Eigene'?null:selected?.id||null,
   custom_brand:brand==='Eigene'?customBrand.trim():null,
   custom_name:brand==='Eigene'?customName.trim():null,
   custom_carbs_g:brand==='Eigene'?Number(customCarbs):null,
   custom_caffeine_mg:brand==='Eigene'?(hasNum(customCaffeine)?Number(customCaffeine):null):null,
   custom_sodium_mg:brand==='Eigene'?(hasNum(customSodium)?Number(customSodium):null):null,
   flavor_note:flavorNote.trim(),quantity:count,priority,note:'',
   updated_at:new Date().toISOString()
  }
  setBusy('add')
  try{
   const {data,error:dbError}=await garminSupabase.from('garmin_gel_inventory')
    .insert(payload).select('*').single()
   if(dbError||!data)throw Error(dbError?.message||'Gel nicht gespeichert.')
   setInventory(old=>[data as Inventory,...old])
   setNotice('Gel gespeichert und in deinen Vorrat aufgenommen.')
   setFlavorNote('');setQuantity(2);setProductId('')
   if(brand==='Eigene'){setCustomName('');setCustomCarbs('')}
  }catch(e){setError(e instanceof Error?e.message:'Gel konnte nicht hinzugefügt werden.')}
  finally{setBusy('')}
 }
 async function changeStock(item:Inventory,patch:Partial<Pick<Inventory,'quantity'|'priority'>>){
  if(busy||!garminSupabase||!userId)return
  const update={
   ...(patch.quantity!==undefined?{quantity:clampInt(Number(patch.quantity),0,500)}:{}),
   ...(patch.priority!==undefined?{priority:clampInt(Number(patch.priority),1,3)}:{}),
   updated_at:new Date().toISOString()
  }
  setBusy(item.id);setError('')
  try{
   const {data,error:dbError}=await garminSupabase.from('garmin_gel_inventory')
    .update(update).eq('id',item.id).eq('user_id',userId).select('*').single()
   if(dbError||!data)throw Error(dbError?.message||'Keine Aktualisierung bestätigt.')
   setInventory(old=>old.map(x=>x.id===item.id?data as Inventory:x))
  }catch(e){setError(e instanceof Error?e.message:'Gel nicht aktualisiert.')}
  finally{setBusy('')}
 }
 async function removeGel(item:Inventory){
  if(busy||!garminSupabase||!userId)return
  setBusy(item.id);setError('')
  try{
   const {data,error:dbError}=await garminSupabase.from('garmin_gel_inventory')
    .delete().eq('id',item.id).eq('user_id',userId).select('id').single()
   if(dbError||!data)throw Error(dbError?.message||'Löschen nicht bestätigt.')
   setInventory(old=>old.filter(x=>x.id!==item.id))
   setConfirmRemove('');setNotice('Gel aus deinem Vorrat entfernt.')
  }catch(e){setError(e instanceof Error?e.message:'Gel nicht entfernt.')}
  finally{setBusy('')}
 }
 async function saveSettings(){
  if(busy||!garminSupabase||!userId)return
  setBusy('settings');setError('')
  try{
   const payload={user_id:userId,race_date:goal.race_date,race_name:goal.race_name,
    drink_carbs_g_per_hour:clampInt(Number(settings.drink_carbs_g_per_hour),0,150),
    allow_caffeine:settings.allow_caffeine,
    aid_confirmed:settings.aid_confirmed,
    aid_every_laps:clampInt(settings.aid_every_laps,1,25),
    aid_drink_mix:settings.aid_drink_mix,
    aid_drink_ml_per_stop:clampInt(settings.aid_drink_ml_per_stop,0,1000),
    aid_custom_carbs_g_per_500:clampInt(settings.aid_custom_carbs_g_per_500,0,150),
    aid_food_name:settings.aid_food_name.trim().slice(0,90),
    aid_food_carbs_g_per_stop:clampInt(settings.aid_food_carbs_g_per_stop,0,120),
    caffeine_start_minute:clampInt(settings.caffeine_start_minute,0,1440),
    caffeine_max_mg:clampInt(settings.caffeine_max_mg,0,400),
    updated_at:new Date().toISOString()}
   const {data,error:dbError}=await garminSupabase.from('garmin_gel_plan_settings')
    .upsert(payload,{onConflict:'user_id,race_date,race_name'}).select('race_date').single()
   if(dbError||!data)throw Error(dbError?.message||'Einstellungen nicht gespeichert.')
   setSettingsDirty(false)
   setNotice('Verpflegungs- und Koffeinplanung für diesen Wettkampf gespeichert.')
  }catch(e){setError(e instanceof Error?e.message:'Einstellungen konnten nicht gespeichert werden.')}
  finally{setBusy('')}
 }
 if(!active)return null
 return <section className="gip-root" aria-label="Deine Gels, Vorrat, Priorität und Einnahmeplanung">
  <header className="gip-header">
   <div><small>RACE PREP / GEL BUDDY</small><h3>Deine Gels. Deine Favoriten. Dein Zeitplan.</h3>
    <p>Wähle nur Gels aus, die du wirklich hast. Wir planen nach KH, Menge und Priorität.</p></div>
   <div className="gip-total"><strong>{totalStock}</strong><span>Gels im Vorrat</span></div>
  </header>
  {error&&<p role="alert" className="gip-error">{error}</p>}
  {notice&&<p role="status" className="gip-success">{notice}</p>}
  {loading?<p className="gip-note">Lade Hersteller und deinen privaten Vorrat …</p>:<>
   <div className="gip-brands" role="group" aria-label="Gel-Marke auswählen">
    {brands.map(b=><button type="button" key={b} className={brand===b?'active':''}
     onClick={()=>{setBrand(b);setProductId('');setError('')}}>{b}</button>)}
   </div>
   <div className="gip-add">
    <div className="gip-add-product">
    {brand!=='Eigene'?<label>Gel aus dem {brand}-Sortiment
     <select value={productId} onChange={e=>setProductId(e.target.value)}>
      <option value="">Produkt und Variante wählen</option>
      {options.map(p=><option value={p.id} key={p.id}>{display(p)}</option>)}
     </select></label>:<div className="gip-custom">
      <label>Hersteller<input maxLength={80} value={customBrand} placeholder="z. B. PowerBar"
       onChange={e=>setCustomBrand(e.target.value)}/></label>
      <label>Produkt<input maxLength={120} value={customName} placeholder="Gelname"
       onChange={e=>setCustomName(e.target.value)}/></label>
      <label>KH pro Gel (g)<input type="number" min={1} max={250} step=".1"
       value={customCarbs} onChange={e=>setCustomCarbs(e.target.value)}/></label>
      <label>Koffein pro Gel (mg)<input type="number" min={0} max={500}
       value={customCaffeine} onChange={e=>setCustomCaffeine(e.target.value)}/></label>
      <label>Natrium pro Gel (mg, optional)<input type="number" min={0} max={3000}
       value={customSodium} placeholder="Unbekannt" onChange={e=>setCustomSodium(e.target.value)}/></label>
     </div>}
     {(selected||brand==='Eigene')&&<label>Geschmack/Notiz (optional)
      <input maxLength={100} value={flavorNote} placeholder="z. B. Neutral, Salty Strawberry"
       onChange={e=>setFlavorNote(e.target.value)}/></label>}
     {selected&&<p className="gip-product-detail">
      {selected.carbs_g!==null?fmt(Number(selected.carbs_g))+' g KH / Portion':'KH-Gehalt noch offen'}
      {selected.caffeine_mg!==null?' · '+selected.caffeine_mg+' mg Koffein':''}
      {selected.sodium_mg!==null?' · '+selected.sodium_mg+' mg Natrium':''}
      {selected.is_bulk?' · Mix/Flask: keine automatische Gel-Einnahme':''}
      {' · '}<a href={selected.official_url} target="_blank" rel="noreferrer">Herstellerdaten</a>
     </p>}
    </div>
    <label>Menge (Stück)<input type="number" min={1} max={500} step={1}
     value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
    <label>Deine Priorität<select value={priority} onChange={e=>setPriority(Number(e.target.value))}>
     <option value={1}>❤ Favorit – zuerst</option>
     <option value={2}>✓ Gut – alternativ</option>
     <option value={3}>⚠ Nur im Notfall</option>
    </select></label>
    <button className="gip-add-button" type="button" disabled={!!busy||!userId}
     onClick={()=>void addGel()}><Icon name="plus"/> {busy==='add'?'Speichere …':'Zu meinem Vorrat'}</button>
   </div>
   <div className="gip-inventory">
    <div className="gip-subheading"><strong>Mein Gel-Vorrat &amp; Reihenfolge</strong>
     <small>Favoriten vor Alternativen · Notfallreserve bleibt außen vor</small></div>
    {!ordered.length?<p className="gip-empty">Noch keine Gels ausgewählt. Wähle oben deine Produkte und wie viele du hast – wir rechnen danach automatisch.</p>:
     <div className="gip-rows">{ordered.map(item=>{
      const x=stock.find(p=>p.id===item.id)
      return <div className={'gip-row gip-priority-'+item.priority} key={item.id}>
       <div className="gip-row-main">
        <strong>{x?.brand} · {x?.name}</strong>
        <span>{x?.flavor} · {Number.isFinite(x?.carbsG)?fmt(x!.carbsG)+' g KH':'KH ungeprüft'}
         {(x?.caffeineMg||0)>0?' · '+x?.caffeineMg+' mg Koffein':''}</span>
       </div>
       <div className="gip-row-controls">
        <div className="gip-stepper"><button type="button" aria-label="Ein Gel weniger" disabled={!!busy||item.quantity===0}
         onClick={()=>void changeStock(item,{quantity:item.quantity-1})}>−</button>
         <span>{item.quantity} ×</span>
         <button type="button" aria-label="Ein Gel mehr" disabled={!!busy||item.quantity>=500}
          onClick={()=>void changeStock(item,{quantity:item.quantity+1})}>+</button></div>
        <select aria-label="Priorität für Gel" disabled={!!busy} value={item.priority}
         onChange={e=>void changeStock(item,{priority:Number(e.target.value)})}>
         {[1,2,3].map(i=><option value={i} key={i}>{priorities[i]}</option>)}
        </select>
        {confirmRemove===item.id?<div className="gip-remove-confirm">
         <button type="button" disabled={!!busy} onClick={()=>void removeGel(item)}>Löschen</button>
         <button type="button" onClick={()=>setConfirmRemove('')}>Abbrechen</button>
        </div>:<button className="gip-remove" type="button" title="Aus Vorrat entfernen"
         onClick={()=>setConfirmRemove(item.id)}><Icon name="trash-2"/></button>}
       </div>
      </div>
     })}</div>}
   </div>
   <div className="gip-planner">
    <div className="gip-subheading"><strong>Verpflegung auf der Strecke · Getränke + Essen + Gels</strong>
     <small>Alle Kohlenhydratquellen in einem Plan – nichts als gegessen markieren</small></div>
    {eventMenu&&<details className="gip-event-menu">
     <summary>Heartbeat · bestätigtes Verpflegungsangebot ansehen</summary>
     <p><strong>KH-Quellen & Essen:</strong> {eventMenu.carbs.join(' · ')}</p>
     <p><strong>Warm & salzig:</strong> {eventMenu.saltyWarm.join(' · ')}</p>
     <p><strong>Weitere Getränke:</strong> {eventMenu.otherDrinks.join(' · ')}</p>
     <p><strong>Koffeinhaltige Optionen:</strong> {eventMenu.caffeine.join(' · ')}.
      Cola, Kaffee und Tee bleiben in deiner Koffeinpause außerhalb der automatisch
      geplanten Versorgung.</p>
     <p className="gip-guidance">{eventMenu.note}</p>
    </details>}
    <p className="gip-guidance">{eventMenu?
     'Das Heartbeat-Angebot ist bekannt. Offen sind die MAURTEN-Carbdrink-Variante, Portionsgrößen und die Verfügbarkeit an jeder einzelnen Station.':
     'Welche Getränke und Lebensmittel es gibt, musst du noch prüfen.'}
     {' '}Ohne ausdrücklich bestätigte Mengen werden dafür
     <strong> 0 g KH </strong> angerechnet. Erst dann werden geplante
     Gel-Portionen entsprechend reduziert.</p>
    <fieldset className="gip-aid">
     <legend>Versorgung an der Strecke</legend>
     <div className="gip-aid-fields">
      {eventMenu?<div className="gip-mix-confirmed">
       <strong>MAURTEN Drink Mix 160 · frei am Versorgungsstopp</strong>
       <span>Aus großem Behälter, keine begrenzte Ausgabeportion.
        Bei Standardmischung: 40 g KH je 500 ml.
        Nur die von dir eingeplante Menge zählt in die KH-Bilanz.
        Zubereitung vor Ort prüfen.</span>
      </div>:<label>Welche Maurten Drink-Mix-Variante wird ausgeschenkt?
       <select value={settings.aid_drink_mix}
        onChange={e=>changeSettings({aid_drink_mix:e.target.value as Settings['aid_drink_mix']})}>
        <option value="unknown">Noch ungeklärt – nicht berechnen</option>
        <option value="160">Drink Mix 160 · 40 g KH / 500 ml</option>
        <option value="320">Drink Mix 320 · 80 g KH / 500 ml</option>
        <option value="custom">Andere bestätigte Mischung</option>
       </select></label>}
      {settings.aid_drink_mix==='custom'&&<label>Bestätigte KH je 500 ml
       <input type="number" min={0} max={150} step={1}
        value={settings.aid_custom_carbs_g_per_500}
        onChange={e=>changeSettings({aid_custom_carbs_g_per_500:Number(e.target.value)})}/>
      </label>}
      <label>Geplanter Drink Mix 160 je Stopp (ml; 0 = noch offen)
       <input type="number" min={0} max={1000} step={50}
        value={settings.aid_drink_ml_per_stop}
        onChange={e=>changeSettings({aid_drink_ml_per_stop:Number(e.target.value)})}/>
      </label>
      <label>Verpflegung alle wie viele Runden?
       <input type="number" min={1} max={25} step={1}
        value={settings.aid_every_laps}
        onChange={e=>changeSettings({aid_every_laps:Number(e.target.value)})}/>
      </label>
      <label>Welche Lebensmittel gibt es? (mit Komma trennen)
       <input maxLength={90} value={settings.aid_food_name} placeholder="z. B. Nudeln, Brötchen, Banane"
        onChange={e=>changeSettings({aid_food_name:e.target.value})}/>
      </label>
      <label>KH je Essensportion (g; bei wechselndem Essen lieber 0)
       <input type="number" min={0} max={120} step={1}
        value={settings.aid_food_carbs_g_per_stop}
        onChange={e=>changeSettings({aid_food_carbs_g_per_stop:Number(e.target.value)})}/>
      </label>
     </div>
     <p className="gip-guidance">Die genannten Speisen werden rundenweise abgewechselt.
      Ein Wert für Essen-KH gilt nur, wenn jede gewählte Portion wirklich ungefähr
      diese Menge liefert. Bei unbekannten Portionsgrößen 0 g eintragen:
      Die Essensidee erscheint trotzdem, wird aber nicht als KH gutgeschrieben.</p>
     {eventMenu&&<p className="gip-guidance">Der große Pott ist kein Trinkziel.
      Trinke nach Durst, Wetter und erprobter Verträglichkeit – nicht unbegrenzt.
      250 ml entsprechen bei Standardmischung etwa 20 g KH; bei 0 ml wird
      nichts angerechnet. Die tatsächlich getrunkene Menge ist damit nicht bestätigt.</p>}
     <label className="gip-check"><input type="checkbox" checked={settings.aid_confirmed}
      onChange={e=>changeSettings({aid_confirmed:e.target.checked})}/>
      Die ausgewählten Getränke, Mengen und Lebensmittel sind geprüft – als Plan berücksichtigen</label>
     {aidPlan.status!=='ready'?<p className="gip-note">Noch keine bestätigten KH aus dem Streckenangebot.
      {aidPlan.status==='unknown-concentration'?' Drink-Mix-Variante oder KH-Konzentration ergänzen.':''}
      {aidPlan.status==='unknown-food'?' Für geplantes Essen das Lebensmittel angeben.':''}
     </p>:<p className="gip-aid-total">
      {aidPlan.stops} Versorgungsstopps · {fmt(aidPlan.drinkCarbsG)} g KH Getränk +
      {' '}{fmt(aidPlan.foodCarbsG)} g KH Essen =
      {' '}<strong>{fmt(aidPlan.totalCarbsG)} g KH an der Strecke geplant.</strong>
      {' '}Nur wenn du diese Portionen tatsächlich nimmst – kein Ist-Verbrauch.</p>}
    </fieldset>
    <div className="gip-settings">
     <label>KH aus eigenen Getränken außerhalb der Stationen (g/h)
      <input type="number" min={0} max={150} step={1} value={settings.drink_carbs_g_per_hour}
       onChange={e=>changeSettings({drink_carbs_g_per_hour:Number(e.target.value)})}/>
     </label>
     <label className="gip-check"><input type="checkbox" checked={settings.allow_caffeine}
      onChange={e=>changeSettings({allow_caffeine:e.target.checked})}/>
      Koffein-Gels aus deinem Vorrat ausdrücklich einplanen</label>
     <label>Frühester Koffeinzeitpunkt (Minuten nach Start)
      <input type="number" min={0} max={1440} step={20}
       value={settings.caffeine_start_minute}
       onChange={e=>changeSettings({caffeine_start_minute:Number(e.target.value)})}/>
     </label>
     <label>Maximal geplantes Koffein aus Gels (mg)
      <input type="number" min={0} max={400} step={25}
       value={settings.caffeine_max_mg}
       onChange={e=>changeSettings({caffeine_max_mg:Number(e.target.value)})}/>
     </label>
     <p className="gip-guidance">Koffein ist aus. Du bist derzeit in der Koffeinpause:
      keine Cola/Red Bull im Plan. Bei Freigabe nur Gels mit ausgewiesenem Koffeingehalt
      aus deinem Bestand, nicht vor der gewählten Rennminute und nur innerhalb des Limits.
      Koffeinmenge und Verträglichkeit vor dem Wettkampf prüfen; nicht mehrere Quellen addieren.</p>
     <button type="button" disabled={!!busy||!loadedKey}
      onClick={()=>void saveSettings()}>{settingsDirty?'Verpflegungsplan speichern':'Einstellungen speichern'}</button>
     {settingsDirty&&<p className="gip-note">Änderungen sind nur eine Vorschau.
      Erst nach Speichern werden sie im Runner Mode übernommen.</p>}
    </div>
    {racePlan.status==='ready'?<>
     <div className="gip-stats">
      <div><small>KH-Ziel gesamt</small><strong>{fmt(racePlan.totalTargetCarbsG||0)} g</strong></div>
      <div><small>KH auf der Strecke</small><strong>{fmt(racePlan.aidCarbsG||0)} g</strong></div>
      <div><small>KH eigene Getränke</small><strong>{fmt(racePlan.ownDrinkCarbsG||0)} g</strong></div>
      <div><small>Gel-KH geplant</small><strong>{fmt(racePlan.plannedCarbsG||0)} g</strong></div>
      <div><small>Gel-Portionen</small><strong>{racePlan.events.length}</strong></div>
      <div><small>KH noch offen</small><strong>{fmt(racePlan.uncoveredG||0)} g</strong></div>
     </div>
     {racePlan.caffeineMg>0&&<p className="gip-aid-total">
      Koffein: {racePlan.caffeineMg} mg aus geplanten Gels; frühestens
      {' '}+{settings.caffeine_start_minute} Min. Nur Planung, keine bestätigte Einnahme.</p>
     }
     {roundRoadmap.status==='ready'&&<details className="gip-round-plan">
      <summary>{roundRoadmap.rounds.length} Runden · Essensfahrplan, Pausen und Koffein ansehen
       <small>{roundRoadmap.totals?.longStops||0} längere Stopps · nur Planung</small>
      </summary>
      <p className="gip-guidance">Früh: kleine, verträgliche Snacks. Bei längeren Pausen:
       ruhig etwas Festes essen, sofern angeboten und erprobt. Später:
       gut verdauliche Portionen statt Experimente.
       Koffein erscheint ausschließlich, wenn ein freigegebenes Koffein-Gel
       für die jeweilige Runde tatsächlich eingeplant wurde.</p>
      {settingsDirty&&<p className="gip-note">Vorschau mit ungespeicherten Einstellungen.
       Im Runner Mode bleibt bis zum Speichern die bisherige Planung aktiv.</p>}
      <div className="gip-round-list">{roundRoadmap.rounds.map(r=>
       <div className={'gip-round-row'+(r.breakType==='long'?' is-long':'')} key={'fuel-round-'+r.round}>
        <div className="gip-round-number"><strong>{r.round}</strong>
         <small>{r.phaseName}</small></div>
        <div className="gip-round-body">
         <div className="gip-round-meta"><span>{r.pauseName}{r.finish?'': ' · '+r.pauseMinutes+' Min.'}</span>
          {r.caffeineMg>0&&<span className="gip-round-caf">
           Koffein geplant: {r.caffeineMg} mg</span>}</div>
         <strong>{r.primaryKind==='gel'?
          r.gelCount+' Gel'+(r.gelCount===1?'':'s')+' laut Plan':
          r.finish?'Im Ziel nach Bedarf':r.primary||'Keine Portion bestätigt'}</strong>
         {r.primaryKind==='gel'&&<small>{r.gelNames.join(' · ')}</small>}
         {!r.finish&&<small>{r.primaryKind==='gel'?
          r.foodIsAdditional?
           'Essen zusätzlich berücksichtigt: '+r.alternative:
           (r.menuAvailable?'Aus dem Veranstalterangebot (Stopp/Portion offen): ':
            'Essenidee (kein automatischer Ersatz): ')+r.alternative:
          r.foodConfirmed?'Essensportion für diese Runde geplant.':
          r.menuAvailable?'Veranstalterangebot · Stopp und Portion noch offen.':
          'Essen nur falls vorhanden und gut verträglich.'}</small>}
         <small>{r.coachHint}</small>
        </div>
        <div className="gip-round-carbs"><strong>{fmt(r.knownCarbsG)} g KH</strong>
         <small>Gels {fmt(r.gelCarbsG)} · Essen {fmt(r.foodCarbsG)} ·
          Getränk {fmt(r.drinkCarbsG)}</small>
         <small>Geplant, nicht verbraucht</small>
        </div>
       </div>)}</div>
      <p className="gip-disclaimer">{roundRoadmap.note}
       Eigene Getränke außerhalb der Stationen werden weiterhin separat
       auf Stundenbasis geplant und sind in den KH je Runde nicht enthalten.</p>
     </details>}
     {aidPlan.status==='ready'&&aidPlan.events.length>0&&<details className="gip-all">
      <summary>Verpflegung an {aidPlan.events.length} Stationen anzeigen</summary>
      <div className="gip-timeline">{aidPlan.events.map(e=><div className="gip-time" key={'aid-'+e.round}>
       <span>Runde {e.round} · +{e.minute} Min.{e.clock?' · '+e.clock+' Uhr':''}</span>
       <strong>{e.drinkMl?e.drinkMl+' ml '+e.drinkName:''}
        {e.foodName&&e.drinkMl?' + ':''}{e.foodName}</strong>
       <small>{fmt(e.drinkCarbsG)} g KH Getränk + {fmt(e.foodCarbsG)} g KH Essen
        = {fmt(e.carbsG)} g KH geplant</small>
      </div>)}</div>
     </details>}
     {!inventory.length?<p className="gip-empty">Keine Produkte erfunden: Füge zuerst deine vorhandenen Gels hinzu, dann entsteht der Einnahmeplan.</p>:
      racePlan.events.length?<>
       <div className="gip-timeline">{racePlan.events.slice(0,7).map(e=>
        <div className="gip-time" key={e.minute+'-'+e.id}>
         <span><b>+{e.minute} Min.</b>{e.clock?' · '+e.clock+' Uhr':''}</span>
         <strong>{e.brand} · {e.name}</strong>
         <small>{e.flavor?e.flavor+' · ':''}{fmt(e.carbsG)} g KH {e.caffeineMg>0?' · '+e.caffeineMg+' mg Koffein':''}</small>
        </div>)}</div>
       {racePlan.events.length>7&&<details className="gip-all"><summary>Gesamten Gel-Zeitplan ({racePlan.events.length} Portionen) anzeigen</summary>
        <div className="gip-timeline">{racePlan.events.map(e=>
         <div className="gip-time" key={'all-'+e.minute+'-'+e.id}>
          <span>+{e.minute} Min.{e.clock?' · '+e.clock+' Uhr':''}</span>
          <strong>{e.brand} · {e.name}</strong>
          <small>{e.flavor} · {fmt(e.carbsG)} g KH</small>
         </div>)}</div>
       </details>}
      </>:<p className="gip-empty">Mit den gewählten Prioritäten ist aktuell keine passende automatische Portion verfügbar. Favoriten/Alternativen hinzufügen oder Mengen prüfen.</p>}
     {(racePlan.uncoveredG||0)>5&&<p className="gip-shortfall">
      Ausgewählte Gels decken {fmt(racePlan.uncoveredG||0)} g deines geplanten Gel-KH-Ziels noch nicht.
      Verpflegung an der Strecke ist nur mit ausdrücklich bestätigten Portionen berücksichtigt.
      Notfallgels werden bewusst nicht automatisch verwendet.</p>}
     {racePlan.reserve.length>0&&<p className="gip-reserve">⚠ Plan B – nur im Notfall:
      {' '}{racePlan.reserve.map(x=>x.quantity+'× '+x.brand+' '+x.name).join(' · ')}</p>}
     <p className="gip-disclaimer">Die Liste ist ein Vorschlag, keine Erinnerung oder automatische Einnahme.
      Vorräte werden nicht abgebucht. Koffein bleibt standardmäßig ausgeschlossen;
      bei Freigabe gelten frühester Zeitpunkt, dein selbst gesetztes Limit und höchstens
      ein SiS-Nootropics-Gel. Andere Koffeinquellen sind nicht eingerechnet.
      Herstellerwerte und Verträglichkeit vor dem Rennen prüfen.</p>
    </>:<p className="gip-note">Sobald Strecke, Zielzeit und KH-Ziel vorliegen, wird der Gel-Zeitplan berechnet.</p>}
   </div>
  </>}
 </section>
}
