/**
 * Actual time-weighted FIT speed at fixed five-bpm heart-rate bands.
 *
 * This measures observed pace/HR, not laboratory running economy, VO2,
 * lactate threshold or intrinsic training adaptations. Weather, hills,
 * sensor bias, hydration and running surface remain important confounders.
 * No raw coordinates or per-sample observations leave the Edge Function.
 */
const good=n=>typeof n==='number'&&Number.isFinite(n)
const round=(n,dp=1)=>Number(n.toFixed(dp))
export const EASY_EFFICIENCY_MIN_COVERAGE=.8
export const EASY_EFFICIENCY_MAX_SAMPLE_GAP=3
const reject=(reason,meta={})=>({qualified:false,reason,bins:[],...meta})

export function screenEasyPaceRun({chunks=[],durationS,distanceM,elevationGainM,
 rpeRaw,feelingRaw}={}){
 const rpe=good(rpeRaw)&&Number.isInteger(rpeRaw)&&rpeRaw>=10&&
  rpeRaw<=100&&rpeRaw%10===0?rpeRaw/10:null
 const feeling=good(feelingRaw)&&[0,25,50,75,100].includes(feelingRaw)?
  feelingRaw:null
 if(!good(durationS)||durationS<2100||durationS>7200||
  !good(distanceM)||distanceM<5000||distanceM>16000)
  return reject('duration-or-distance')
 if(!good(elevationGainM)||elevationGainM<0||elevationGainM>3000)
  return reject('terrain-unknown')
 const elevationMPerKm=elevationGainM/(distanceM/1000)
 if(elevationMPerKm>12)return reject('hilly')
 if(rpe===null)return reject('rpe-missing')
 if(rpe>5||feeling!==null&&feeling<=25)return reject('hard-or-poor-feeling')
 const bucket=distanceM<8000?'5–8 km':distanceM<12000?'8–12 km':'12–16 km'
 const bins=new Map()
 let validSeconds=0,observedSeconds=0,points=0,prev=null,firstElapsed=null
 let maxGap=0,gapSeconds=0
 let weightedSpeed=0,speedSquare=0
 for(const chunk of Array.isArray(chunks)?chunks:[]){
  for(const p of Array.isArray(chunk)?chunk:[]){
   const t=p?.elapsed,hr=p?.hr,speed=p?.speed
   if(!good(t)||t<0||t>30000)continue
   if(firstElapsed===null)firstElapsed=t
   const now={elapsed:t,hr:good(hr)&&hr>=40&&hr<=210?hr:null,
    speed:good(speed)&&speed>=1.2&&speed<=6.5?speed:null}
   points++
   if(prev!==null){
    const dt=now.elapsed-prev.elapsed
    if(dt>0&&dt<=EASY_EFFICIENCY_MAX_SAMPLE_GAP){
     observedSeconds+=dt
     if(prev.hr!==null&&prev.speed!==null&&now.speed!==null){
      const v=prev.speed
      const bin=Math.floor(prev.hr/5)*5
      const entry=bins.get(bin)||{seconds:0,weightedSpeed:0}
      entry.seconds+=dt
      entry.weightedSpeed+=dt*v
      bins.set(bin,entry)
      weightedSpeed+=dt*v
      speedSquare+=dt*v*v
      validSeconds+=dt
     }
    }else if(dt>EASY_EFFICIENCY_MAX_SAMPLE_GAP){
     gapSeconds+=dt;maxGap=Math.max(maxGap,dt)
    }
   }
   if(prev===null||now.elapsed>=prev.elapsed)prev=now
  }
 }
 if(points<250||maxGap>60||gapSeconds>durationS*.04||
  firstElapsed===null||prev===null||prev.elapsed-firstElapsed>durationS*1.08||
  prev.elapsed-firstElapsed<durationS*.75||
  validSeconds<1500||validSeconds/durationS<
  EASY_EFFICIENCY_MIN_COVERAGE||validSeconds>durationS*1.05)
  return reject('fit-coverage',{validSeconds:round(validSeconds),points})
 const mean=weightedSpeed/validSeconds
 const speedCv=Math.sqrt(Math.max(0,speedSquare/validSeconds-mean*mean))/mean
 if(speedCv>.15)return reject('uneven-speed',{validSeconds:round(validSeconds),
  speedCv:round(speedCv,3)})
 const hrBins=[...bins.entries()].map(([b,e])=>({
  bpmFrom:b,bpmTo:b+4,seconds:round(e.seconds),
  speedMps:round(e.weightedSpeed/e.seconds,4)
 })).filter(x=>x.seconds>=300).sort((a,b)=>a.bpmFrom-b.bpmFrom)
 if(!hrBins.length)return reject('no-hr-band',{validSeconds:round(validSeconds)})
 return {qualified:true,reason:null,distanceBand:bucket,
  gainMPerKm:round(elevationMPerKm),rpe,validSeconds:round(validSeconds),
  coveragePercent:round(100*validSeconds/durationS),
  speedCv:round(speedCv,3),bins:hrBins}
}
