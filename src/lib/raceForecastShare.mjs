/** Weather-only wording. No forecast is ever an observed or guaranteed outcome. */
const MS_DAY=86400000
const asDay=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null
 const [y,m,d]=value.split('-').map(Number)
 const time=Date.UTC(y,m-1,d)
 return new Date(time).toISOString().slice(0,10)===value?time:null
}
export function raceForecastStatus(raceDate,today,hasHours){
 const day=asDay(raceDate),current=asDay(today)
 if(day===null||current===null)
  return {days:null,label:'Datum fehlt',tone:'missing',description:'Zuerst ein gültiges Renndatum festlegen.'}
 const days=Math.round((day-current)/MS_DAY)
 if(days<0)return {days,label:'Rennen vorbei',tone:'past',description:'Dieser Wettkampftermin liegt in der Vergangenheit.'}
 if(!hasHours)return {days,label:'Stundenprognose fehlt',tone:'missing',
  description:days>15?'Für diesen Termin gibt es noch keine Stundenprognose.':
   'Die Stundenprognose für die gesamte Rennstrecke oder Renndauer ist noch nicht vollständig.'}
 if(days<=3)return {days,label:'Relativ belastbare Prognose',tone:'near',
  description:'Noch '+days+' Tage: Die kurzfristige Prognose ist meist verlässlicher, bleibt aber eine Vorhersage. Regen und Böen können sich kurzfristig ändern.'}
 if(days<=7)return {days,label:'Vorläufige Prognose',tone:'medium',
  description:'Noch '+days+' Tage: Temperatur ist eine erste Orientierung; Niederschlag und Wind können sich noch deutlich verändern.'}
 return {days,label:'Früher Wettertrend',tone:'far',
  description:'Noch '+days+' Tage: Ein grober Wettertrend, keine belastbare Detailplanung. Kurz vor dem Rennen erneut prüfen.'}
}
const round=x=>Math.round(x)
const pad=x=>String(x).padStart(2,'0')
function advice(info){
 const result=[]
 if(info.temp?.[0]<=3)result.push('Warme Startkleidung und Schutz vor Auskühlen bereithalten.')
 if(info.temp?.[1]>=25)result.push('Wärme berücksichtigen: Tempo und Trinkversorgung anpassen.')
 if(info.rain>=45||info.changes.includes('Regen möglich'))
  result.push('Auf Regen vorbereiten; trockene Wechselkleidung einplanen.')
 if(info.gust>=35)result.push('Böen einplanen und auf offenen Abschnitten nach Belastung laufen.')
 if(info.changes.includes('Dunkelheit'))result.push('Sichtbarkeit und gegebenenfalls Stirnlampe prüfen.')
 if(!result.length)result.push('Laufkleidung an die Temperatur anpassen.')
 result.push('Vor dem Start die aktuellste Wetterprognose prüfen.')
 return result
}
export function formatRaceWeatherShare({race,info,status,place,finish,pointToPoint=false,
 stages=[],windTip=null,fetchedAt}){
 const countdown=status.days===0?'Heute ist Renntag!':
  status.days===1?'Noch 1 Tag bis zum Rennen!':
  'Noch '+status.days+' Tage bis zum Rennen!'
 const date=race.race_date.split('-').reverse().join('.')
 const start=race.race_start_time?' · Start '+race.race_start_time.slice(0,5)+' Uhr':''
 const where=pointToPoint&&finish?place+' → '+finish:place
 const lines=[
  '🏃 GARMIN_AI · RENNWETTER',
  '⏳ '+countdown,
  '🏁 '+race.race_name,
  '📅 '+date+start,
  '📍 '+where,
  '',
  '🔎 '+status.label,
  '🌡️ Temperatur: '+info.temp[0]+'–'+info.temp[1]+' °C',
  '🌧️ Regenwahrscheinlichkeit: bis '+round(info.rain)+' %',
  '💨 Windböen: bis '+round(info.gust)+' km/h'
 ]
 if(info.changes.length)lines.push('⚠️ '+info.changes.join(' · '))
 if(stages.length>=2){
  lines.push('','📍 Wetter entlang der Strecke (Durchgangszeiten geschätzt):')
  for(const s of stages)lines.push('• '+s.label+' · '+pad(s.weather.hour)+':00 Uhr: '+
   round(s.weather.temperature)+' °C, Regen '+round(s.weather.rainProbability)+
   ' %, Böen '+round(s.weather.gust)+' km/h')
 }
 lines.push('','🎒 Darauf solltest du dich einstellen:')
 for(const a of advice(info))lines.push('• '+a)
 if(windTip&&info.gust>=35)lines.push('• Wind: '+windTip)
 lines.push('','🕒 Datenabruf: '+new Date(fetchedAt).toLocaleString('de-DE')+
  ' · Quelle: Open-Meteo','Hinweis: Wetterprognose, keine garantierte Wetterlage.')
 return lines.join('\n')
}
