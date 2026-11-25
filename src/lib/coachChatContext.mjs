import {buildCoachDailyBrief} from './coachDailyBrief.mjs'
import {answerCoachQuestion} from './askCoach.mjs'
const short=(v,n=400)=>typeof v==='string'?v.slice(0,n):''
export function buildCoachChatContext({today,snapshot,plan,weather}){
 if(!snapshot||plan?.today!==today)return ''
 const brief=buildCoachDailyBrief({today,plan,health:snapshot.health})
 const evidence=['today','recovery','progress','goal','memory'].map(topic=>{
  const a=answerCoachQuestion({topic,today,snapshot,plan})
  return {topic,title:short(a.title,150),body:a.body.slice(0,5).map(x=>short(x,300))}
 })
 return JSON.stringify({date:today,trainingMethod:'Polarisiert / 80-20 als Orientierung',todayAdvice:brief?{title:brief.title,kind:brief.kind,guidance:brief.guidance,reason:short(brief.reason,1000),next:brief.next,dataNote:brief.dataNote}:null,
 week:plan.days.slice(0,7).map(d=>({date:d.date,title:short(d.selectedGroup?.title||d.title,100),kind:d.kind,minutes:d.minutes,advice:d.selectedGroup?.advice||null,reason:short(d.reason,200)})),
 weather:weather?.date===today?short(weather.text,450):null,evidence}).slice(0,11000)
}
