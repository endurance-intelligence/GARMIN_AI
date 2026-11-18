import {useEffect,useMemo,useState} from 'react'
import {garminSupabase} from '../lib/garminSupabase'
import {buildGelPlan} from '../lib/gelTiming.mjs'
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
type Settings={drink_carbs_g_per_hour:number;allow_caffeine:boolean}
const priorities=['','❤ Favorit','✓ Gut verträglich','⚠ Notfallreserve'] as const
const brands:Brand[]=['Maurten','SiS','226ERS','Eigene']
const fmt=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const num=(n:unknown)=>n===null||n===undefined?null:Number(n)
const clampInt=(n:number,min:number,max:number)=>Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):min
function display(p:Product){return p.name+' · '+p.flavor+' · '+
 (p.carbs_g===null?'KH noch nicht verifiziert':fmt(Number(p.carbs_g))+' g KH')+
 (Number(p.caffeine_mg)>0?' · '+p.caffeine_mg+' mg Koffein':'')}
export function GelInventoryPlanner({active,goal,durationMinutes,carbsGPerHour,onScheduleChange}:{
 active:boolean;goal:CoachGoal;durationMinutes:number|null;carbsGPerHour:number|null;
 onScheduleChange?:(events:GelPlanEvent[]|null)=>void
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
 const [settings,setSettings]=useState<Settings>({drink_carbs_g_per_hour:0,allow_caffeine:false})
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
   setSettings({drink_carbs_g_per_hour:Number(prefs.data?.drink_carbs_g_per_hour||0),
    allow_caffeine:Boolean(prefs.data?.allow_caffeine)})
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
 const racePlan=useMemo(()=>buildGelPlan({
  durationMinutes:durationMinutes||0,targetCarbsGPerHour:carbsGPerHour??0,
  drinkCarbsGPerHour:Number(settings.drink_carbs_g_per_hour),
  allowCaffeine:settings.allow_caffeine,inventory:stock,startTime:goal.race_start_time
 }),[durationMinutes,carbsGPerHour,settings,stock,goal.race_start_time])
 useEffect(()=>{
  if(!onScheduleChange)return
  onScheduleChange(!loading&&loadedKey===key&&racePlan.status==='ready'?
   racePlan.events:null)
 },[onScheduleChange,loading,loadedKey,key,racePlan])
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
    allow_caffeine:settings.allow_caffeine,updated_at:new Date().toISOString()}
   const {data,error:dbError}=await garminSupabase.from('garmin_gel_plan_settings')
    .upsert(payload,{onConflict:'user_id,race_date,race_name'}).select('race_date').single()
   if(dbError||!data)throw Error(dbError?.message||'Einstellungen nicht gespeichert.')
   setNotice('Gel-Plan-Einstellungen für diesen Wettkampf gespeichert.')
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
    <div className="gip-subheading"><strong>Wann welches Gel nehmen?</strong>
     <small>Automatischer Entwurf für {goal.race_name}</small></div>
    <p className="gip-guidance">Erste Portion grob nach 20 Minuten, danach über das Rennen verteilt etwa alle 20–30 Minuten prüfen.
     Entscheidend sind die KH-Mengen je Produkt, Getränke, Verträglichkeit und dein tatsächlicher Rennverlauf – nicht eine starre Gel-Uhr.</p>
    <div className="gip-settings">
     <label>KH aus Getränken pro Stunde (g)
      <input type="number" min={0} max={150} step={1} value={settings.drink_carbs_g_per_hour}
       onChange={e=>setSettings(s=>({...s,drink_carbs_g_per_hour:Number(e.target.value)}))}/>
     </label>
     <label className="gip-check"><input type="checkbox" checked={settings.allow_caffeine}
      onChange={e=>setSettings(s=>({...s,allow_caffeine:e.target.checked}))}/>
      Koffein-Gels ausdrücklich einplanen</label>
     <button type="button" disabled={!!busy||!loadedKey}
      onClick={()=>void saveSettings()}>Einstellungen speichern</button>
    </div>
    {racePlan.status==='ready'?<>
     <div className="gip-stats">
      <div><small>KH-Ziel gesamt</small><strong>{fmt((carbsGPerHour||0)*(durationMinutes||0)/60)} g</strong></div>
      <div><small>Davon per Gel geplant</small><strong>{fmt(racePlan.plannedCarbsG||0)} g</strong></div>
      <div><small>Gel-Abdeckung</small><strong>{racePlan.coveragePercent} %</strong></div>
      <div><small>Gel-Kalorien</small><strong>{fmt(racePlan.plannedKcal||0)} kcal</strong></div>
     </div>
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
      Weitere Getränke oder feste Nahrung sind hier nur berücksichtigt, soweit du sie oben in g/h eingetragen hast.
      Notfallgels werden bewusst nicht automatisch verwendet.</p>}
     {racePlan.reserve.length>0&&<p className="gip-reserve">⚠ Plan B – nur im Notfall:
      {' '}{racePlan.reserve.map(x=>x.quantity+'× '+x.brand+' '+x.name).join(' · ')}</p>}
     <p className="gip-disclaimer">Die Liste ist ein Vorschlag, keine Erinnerung oder automatische Einnahme.
      Vorräte werden nicht abgebucht. Koffein bleibt standardmäßig ausgeschlossen; bei Freigabe berücksichtigen wir nur ausgewiesene Mengen, höchstens ein SiS-Nootropics-Gel und maximal 400 mg aus geplanten Gels – andere Koffeinquellen sind nicht eingerechnet.
      Herstellerwerte und Verträglichkeit vor dem Rennen prüfen.</p>
    </>:<p className="gip-note">Sobald Strecke, Zielzeit und KH-Ziel vorliegen, wird der Gel-Zeitplan berechnet.</p>}
   </div>
  </>}
 </section>
}
