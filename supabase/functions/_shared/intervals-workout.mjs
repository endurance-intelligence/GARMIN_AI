/**
 * GARMIN_AI -> Intervals.icu structured RUN workout conversion.
 * Mirrors Endurance Intelligence's description-based publication strategy.
 * No Garmin private API. No implicit pace inference.
 */
const acceptedKinds=new Set(['run','recovery','drill','warmup','cooldown']);
const limit=50;
const integer=(n,a,b)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=a&&n<=b;
const label=(s)=>String(s||'').replace(/[^\p{L}\p{N} .:_-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,55);
const pace=(s)=>String(Math.floor(s/60))+':'+String(s%60).padStart(2,'0');
function distanceToken(m){return m+'mtr'}
function target(p){
 if(p===null||p===undefined)return '';
 if(!integer(p,120,900))throw Error('Invalid pace');
 const fast=Math.max(120,p-10),slow=Math.min(900,p+10);
 return pace(fast)+'-'+pace(slow)+'/km Pace';
}
function renderStep(s,i,section){
 if(!s||!acceptedKinds.has(s.kind))throw Error('Invalid step kind');
 const dist=s.distanceMeters??null,duration=s.durationSeconds??null;
 const mode=s.endMode??'lap';
 if(dist!==null&&!integer(dist,20,50000))throw Error('Invalid distance');
 if(duration!==null&&!integer(duration,10,36000))throw Error('Invalid duration');
 if(mode!=='lap'&&mode!=='distance')throw Error('Invalid completion mode');
 if(mode==='distance'&&dist===null)throw Error('Distance is required for automatic step');
 const intensity=s.kind==='run'?'interval':s.kind==='recovery'?'recovery':s.kind==='warmup'?'warmup':s.kind==='cooldown'?'cooldown':'other';
 const prefix=s.kind==='run'?'LAUF':s.kind==='recovery'?'TRAB':s.kind==='warmup'?'EINLAUFEN':s.kind==='cooldown'?'AUSLAUFEN':'DRILLS';
 const meters=dist!==null?(dist===400?'400ER':dist===800?'800ER':dist+'M'):'';
 const info=label([prefix,meters,i>0?String(i):''].filter(Boolean).join(' '));
 // Intervals.icu supports "Press lap" for Garmin. A generous reference
 // duration allows Garmin to display a field; pressing LAP ends the step.
 const completion=mode==='distance'?distanceToken(dist):'Press lap '+(duration!==null?duration+'s':'60m');
 return '- '+(mode==='lap'?'Press lap ':'')+[info,mode==='lap'?completion.replace(/^Press lap /,''):completion,target(s.paceSecondsPerKm), 'intensity='+intensity].filter(Boolean).join(' ');
}
export function buildIntervalsWorkout(snapshot,title){
 if(!snapshot||typeof snapshot!=='object'||!snapshot.group||!Array.isArray(snapshot.group.steps)||!snapshot.group.steps.length)
  throw Error('Missing reviewed trainer group');
 if(snapshot.group.steps.length+2>limit)throw Error('Garmin supports at most 50 steps');
 if(!snapshot.group.steps.some(s=>s.kind==='run'))throw Error('Workout has no running efforts');
 const warm={kind:'warmup',...(snapshot.warmup||{})};
 const cool={kind:'cooldown',...(snapshot.cooldown||{})};
 const parts=['Einlaufen',renderStep(warm,0,'warmup'),'',
              label(snapshot.group.name||'Intervalle')];
 snapshot.group.steps.forEach((s,i)=>parts.push(renderStep(s,i+1,'main')));
 parts.push('','Auslaufen',renderStep(cool,0,'cooldown'));
 const description=parts.join('\n');
 if(description.length>16000)throw Error('Workout description too long');
 return {name:label(title)||'GARMIN_AI Training',type:'Run',category:'WORKOUT',target:'PACE',
         description,stepCount:snapshot.group.steps.length+2};
}
export function buildIntervalsEvent(plan){
 if(!plan||!plan.archive_snapshot||!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.training_date))||
    !/^[0-9a-f-]{36}$/i.test(String(plan.id)))throw Error('Invalid approved plan');
 const w=buildIntervalsWorkout(plan.archive_snapshot,plan.title);
 return {category:w.category,type:w.type,name:w.name,target:w.target,
   start_date_local:plan.training_date+'T18:00:00',
   external_id:'garmin-ai:'+plan.id,description:w.description};
}
