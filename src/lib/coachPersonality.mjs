/** Expression follows existing advice, never speed, mileage or a made-up rating. */
export function coachMood(plan,today=plan?.today){
 const day=plan?.days?.find(d=>d.date===today)
 if(!day)return 'neutral'
 if(day.selectedGroup?.advice==='skip'||day.kind==='illness')return 'firm'
 if(day.kind==='blocked'||day.kind==='recovery'||day.kind==='return_easy'||day.selectedGroup?.advice==='easy')return 'supportive'
 if(day.kind==='race')return 'focused'
 const impact=plan.nextImpact
 if(impact?.fresh&&impact.latest){
  if(impact.severe||impact.status==='reduce')return 'reflective'
  if(impact.status==='stable'&&impact.latest.deltaMinutes!==null&&Math.abs(impact.latest.deltaMinutes)<=5&&
    typeof impact.latest.rpe==='number'&&impact.latest.rpe<=6&&/^(good|very_good|gut|sehr gut|strong|normal)$/i.test(impact.latest.feeling||''))return 'celebrate'
 }
 if(day.kind==='completed')return 'supportive'
 if(plan.attention||day.decision==='declined')return 'reflective'
 return 'focused'
}
export function resolveFollowUp(query,previousTopic,resolve){
 const explicit=resolve(query)
 if(explicit)return explicit
 const q=String(query||'').trim().toLowerCase()
 if(previousTopic&&q.length<=90&&/^(und\b|warum\b|wieso\b|was bedeutet\b|was heißt\b|wie genau\b|was ist mit\b|wie sieht es\b|kannst du das\b|mehr dazu\b)/.test(q))return previousTopic
 return null
}

/** Conversation mood is independent of today's training recommendation. */
export function coachChatMood(topic=null,pending=false){
 if(topic==='symptoms')return 'firm'
 if(pending)return 'focused'
 return 'friendly'
}
