export const emptyHealthPreferences=()=>({heightCm:null,birthYear:null,adultConfirmed:false,weighReminder:'off'})
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
export function normalizeHealthPreferences(v,today){
 if(!v||typeof v!=='object'||Array.isArray(v)||!validDate(today))return null
 const {heightCm,birthYear,adultConfirmed,weighReminder}=v,year=Number(today.slice(0,4))
 if(heightCm!==null&&(typeof heightCm!=='number'||!Number.isFinite(heightCm)||heightCm<100||heightCm>250||Math.abs(heightCm*10-Math.round(heightCm*10))>1e-7))return null
 if(birthYear!==null&&(!Number.isInteger(birthYear)||birthYear<1900||birthYear>year))return null
 if(typeof adultConfirmed!=='boolean'||(adultConfirmed&&birthYear!==null&&year-birthYear<18)||!['off','daily','three-weekly'].includes(weighReminder))return null
 return {heightCm,birthYear,adultConfirmed,weighReminder}
}
export function adultBmi(kg,prefs,today){
 const p=normalizeHealthPreferences(prefs,today)
 if(!p?.adultConfirmed||p.heightCm===null||typeof kg!=='number'||!Number.isFinite(kg)||kg<30||kg>300)return null
 return Math.round(kg/(p.heightCm/100)**2*10)/10
}
export function weighReminderDue(prefs,today,dates,dismissedDate){
 const p=normalizeHealthPreferences(prefs,today)
 if(!p?.adultConfirmed||p.weighReminder==='off'||!Array.isArray(dates)||dates.includes(today)||dismissedDate===today)return false
 return p.weighReminder==='daily'||[1,3,5].includes(new Date(today+'T12:00:00Z').getUTCDay())
}
export function explicitGarminProfile(raw){
 const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{}
 const root=obj(raw),scopes=[root,obj(root.userData),obj(root.profile),obj(root.settings),obj(root.userProfile)]
 // Only unit-explicit height candidates. Generic height or weight are never interpreted.
 const heights=[...new Set(scopes.flatMap(s=>[s.heightCm,s.heightInCentimeters]).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=100&&x<=250&&Math.abs(x*10-Math.round(x*10))<1e-7))]
 const years=[...new Set(scopes.flatMap(s=>[s.birthYear,...[s.birthDate,s.dateOfBirth].filter(validDate).map(x=>Number(x.slice(0,4)))]).filter(x=>Number.isInteger(x)&&x>=1900&&x<=new Date().getUTCFullYear()))]
 return {heightCm:heights.length===1?heights[0]:null,birthYear:years.length===1?years[0]:null}
}
