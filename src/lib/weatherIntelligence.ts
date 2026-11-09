/** GARMIN_AI Horizon weather intelligence v0.9.8.
 * Weather-only guidance, not a medical/training readiness decision.
 * Open-Meteo uses UNIX timestamps; IANA timezone prevents DST errors.
 * Shared by Coach, Calendar and Race Prep. Never writes to Garmin.
 */
export type WeatherPlace={
 name:string;latitude:number;longitude:number;country?:string;admin1?:string
}
export type WeatherHour={
 epoch:number;date:string;hour:number;
 temperature:number;feelsLike:number;rainProbability:number;
 precipitation:number;wind:number;gust:number;code:number;
 isDay:boolean;humidity:number
}
export type Forecast={place:WeatherPlace;timezone:string;fetchedAt:number;hours:WeatherHour[]}
export type TrainingSlot={
 date:string;startHour:number;durationMinutes:number;
 hours:WeatherHour[];level:'günstig'|'wechselhaft'|'ungünstig'|'kritisch';
 reason:string;weatherOnly:true
}
const FORECAST_MAX_DAYS=16
const HALF_HOUR=30*60*1000
const cache=new Map<string,Forecast>()
const pending=new Map<string,Promise<Forecast>>()

export function validPlace(v:unknown):v is WeatherPlace {
 if(!v||typeof v!=='object'||Array.isArray(v))return false
 const p=v as Record<string,unknown>
 return typeof p.name==='string'&&p.name.length>0&&p.name.length<=120&&
  typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&
  typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180
}
export function localParts(epoch:number,timezone:string){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date(epoch*1000))
 const v=(kind:string)=>parts.find(p=>p.type===kind)?.value||''
 return {date:[v('year'),v('month'),v('day')].join('-'),hour:Number(v('hour'))}
}
export function localToday(timezone:string,now=Date.now()){
 return localParts(Math.floor(now/1000),timezone).date
}
function valueAt(items:unknown,index:number):number|null{
 if(!Array.isArray(items))return null
 const value=items[index]
 return typeof value==='number'&&Number.isFinite(value)?value:null
}
export function parseForecast(raw:unknown,place:WeatherPlace,at=Date.now()):Forecast {
 if(!validPlace(place)||!raw||typeof raw!=='object')throw Error('Wetterdaten ungültig')
 const data=raw as Record<string,unknown>
 if(typeof data.timezone!=='string'||data.timezone.length>80)throw Error('Zeitzone fehlt')
 try{new Intl.DateTimeFormat('en',{timeZone:data.timezone})}
 catch{throw Error('Zeitzone ungültig')}
 const hourly=data.hourly as Record<string,unknown>|undefined
 if(!hourly||!Array.isArray(hourly.time)||hourly.time.length<1||
   hourly.time.length>16*25)throw Error('Stundenprognose unvollständig')
 const hours:WeatherHour[]=[]
 for(let i=0;i<hourly.time.length;i++){
  const epoch=valueAt(hourly.time,i)
  const temp=valueAt(hourly.temperature_2m,i)
  const feel=valueAt(hourly.apparent_temperature,i)
  const rain=valueAt(hourly.precipitation_probability,i)
  const precipitation=valueAt(hourly.precipitation,i)
  const wind=valueAt(hourly.wind_speed_10m,i)
  const gust=valueAt(hourly.wind_gusts_10m,i)
  const code=valueAt(hourly.weather_code,i)
  const day=valueAt(hourly.is_day,i)
  const humidity=valueAt(hourly.relative_humidity_2m,i)
  if(epoch===null||temp===null||feel===null||rain===null||
    precipitation===null||wind===null||gust===null||code===null||
    day===null||humidity===null||
    !Number.isSafeInteger(epoch)||rain<0||rain>100||
    precipitation<0||gust<0||wind<0||humidity<0||humidity>100||
    (day!==0&&day!==1))continue
  const parts=localParts(epoch,data.timezone)
  hours.push({
   epoch,date:parts.date,hour:parts.hour,
   temperature:temp,feelsLike:feel,rainProbability:rain,
   precipitation,wind,gust,code,isDay:day===1,humidity
  })
 }
 if(hours.length<1)throw Error('Keine vollständigen Wetterstunden')
 hours.sort((a,b)=>a.epoch-b.epoch)
 return {place,timezone:data.timezone,fetchedAt:at,hours}
}
export async function getWeather(place:WeatherPlace,force=false,now=Date.now()):Promise<Forecast>{
 if(!validPlace(place))throw Error('Bitte zuerst einen Ort auswählen')
 const key=place.latitude.toFixed(4)+':'+place.longitude.toFixed(4)
 const cached=cache.get(key)
 if(!force&&cached&&now-cached.fetchedAt<HALF_HOUR)return cached
 if(pending.has(key))return pending.get(key)!
 const url=new URL('https://api.open-meteo.com/v1/forecast')
 url.searchParams.set('latitude',String(place.latitude))
 url.searchParams.set('longitude',String(place.longitude))
 url.searchParams.set('hourly','temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code,is_day,relative_humidity_2m')
 url.searchParams.set('timezone','auto')
 url.searchParams.set('timeformat','unixtime')
 url.searchParams.set('forecast_days',String(FORECAST_MAX_DAYS))
 const task=(async()=>{
  const res=await fetch(url,{signal:AbortSignal.timeout(12000)})
  if(!res.ok)throw Error('Wetterdienst HTTP '+res.status)
  const report=parseForecast(await res.json(),place,Date.now())
  cache.set(key,report)
  return report
 })()
 pending.set(key,task)
 try{return await task}finally{pending.delete(key)}
}
export async function findPlaces(search:string):Promise<WeatherPlace[]>{
 const name=search.trim()
 if(name.length<2||name.length>90)return []
 const url=new URL('https://geocoding-api.open-meteo.com/v1/search')
 url.searchParams.set('name',name)
 url.searchParams.set('language','de')
 url.searchParams.set('count','6')
 const res=await fetch(url,{signal:AbortSignal.timeout(9000)})
 if(!res.ok)throw Error('Ortssuche momentan nicht verfügbar')
 const body=await res.json() as {results?:unknown[]}
 return (Array.isArray(body.results)?body.results:[]).map((v):WeatherPlace|null=>{
  if(!v||typeof v!=='object')return null
  const p=v as Record<string,unknown>
  const place:WeatherPlace={
   name:typeof p.name==='string'?p.name:'',
   latitude:Number(p.latitude),longitude:Number(p.longitude),
   country:typeof p.country==='string'?p.country:undefined,
   admin1:typeof p.admin1==='string'?p.admin1:undefined
  }
  return validPlace(place)?place:null
 }).filter((v):v is WeatherPlace=>v!==null)
}
export function weatherLabel(code:number):string{
 if([0].includes(code))return 'Klar'
 if([1,2,3].includes(code))return 'Bewölkt'
 if([45,48].includes(code))return 'Nebel'
 if([51,53,55,56,57].includes(code))return 'Nieselregen'
 if([61,63,65,66,67,80,81,82].includes(code))return 'Regen'
 if([71,73,75,77,85,86].includes(code))return 'Schnee'
 if([95,96,99].includes(code))return 'Gewitter'
 return 'Wechselhaft'
}
function tier(h:WeatherHour):number{
 if(h.code>=95||h.gust>=65||h.precipitation>=4||
    h.feelsLike<=-12||h.feelsLike>=35)return 3
 if(h.gust>=50||h.precipitation>=2||h.feelsLike<=-5||h.feelsLike>=30||
    [66,67,75,82,86].includes(h.code))return 2
 if(h.gust>=35||h.precipitation>=0.4||h.rainProbability>=65||
    h.feelsLike<0||h.feelsLike>26)return 1
 return 0
}
function rank(hours:WeatherHour[]){
 const severity=Math.max(...hours.map(tier))
 const night=hours.filter(h=>!h.isDay).length
 const precipitation=hours.reduce((a,h)=>a+h.precipitation,0)
 const chance=Math.max(...hours.map(h=>h.rainProbability))
 const gust=Math.max(...hours.map(h=>h.gust))
 // Only compare weather evidence; we deliberately expose no fake readiness score.
 return [severity,night,precipitation,chance,gust]
}
function compare(a:number[],b:number[]){
 for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i]
 return 0
}
export function bestTrainingSlot(
 forecast:Forecast,date:string,durationMinutes=60,now=Date.now()
):TrainingSlot|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
   ![30,45,60,75,90,120,150,180].includes(durationMinutes))return null
 const samples=Math.ceil(durationMinutes/60)
 const relevant=forecast.hours.filter(h=>h.date===date)
 const upcoming=forecast.hours.filter(h=>h.epoch*1000>=now+10*60000)
 const candidates:{rows:WeatherHour[];rank:number[]}[]=[]
 for(const hour of relevant){
  if(hour.hour<6||hour.hour>21||!upcoming.includes(hour))continue
  const idx=forecast.hours.indexOf(hour)
  const rows=forecast.hours.slice(idx,idx+samples)
  if(rows.length!==samples||rows.some((h,i)=>h.epoch!==hour.epoch+3600*i||
    h.date!==date||h.hour>22))continue
  candidates.push({rows,rank:rank(rows)})
 }
 candidates.sort((a,b)=>compare(a.rank,b.rank)||a.rows[0].epoch-b.rows[0].epoch)
 const selected=candidates[0]?.rows
 if(!selected)return null
 const worst=Math.max(...selected.map(tier))
 const maxGust=Math.max(...selected.map(x=>x.gust))
 const rain=Math.max(...selected.map(x=>x.rainProbability))
 const feels=selected.map(x=>x.feelsLike)
 const remarks:string[]=[]
 if(selected.some(h=>h.precipitation>=0.4)||rain>=50)remarks.push('Regen möglich')
 if(maxGust>=35)remarks.push('kräftiger Wind')
 if(feels.some(x=>x>=27))remarks.push('warm – Trinkmenge beachten')
 if(feels.some(x=>x<=0))remarks.push('kalt – Kleidung anpassen')
 if(selected.some(x=>!x.isDay))remarks.push('Dunkelheit berücksichtigen')
 if(!remarks.length)remarks.push('im Vergleich wenig Regen und Wind')
 return {date,startHour:selected[0].hour,durationMinutes,hours:selected,
  level:(['günstig','wechselhaft','ungünstig','kritisch'] as const)[worst],
  reason:remarks.slice(0,2).join(' · '),weatherOnly:true}
}
export function hourAt(forecast:Forecast,date:string,hour:number):WeatherHour|null{
 return forecast.hours.find(h=>h.date===date&&h.hour===hour)||null
}
export function raceSegments(
 forecast:Forecast,date:string,startHour:number,durationHours:number
):{segments:WeatherHour[];complete:boolean}|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(startHour)||
    startHour<0||startHour>23||!Number.isInteger(durationHours)||
    durationHours<1||durationHours>48)return null
 const index=forecast.hours.findIndex(h=>h.date===date&&h.hour===startHour)
 if(index<0)return null
 const all=forecast.hours.slice(index,index+durationHours)
 const complete=all.length===durationHours&&
  all.every((h,i)=>h.epoch===forecast.hours[index].epoch+i*3600)
 return {complete,segments:all.filter((_,i)=>i%3===0)}
}
