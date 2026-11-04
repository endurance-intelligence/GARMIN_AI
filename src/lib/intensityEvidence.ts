/** GARMIN_AI v0.7.0 - descriptive Garmin zone distribution, not metabolic thresholds. */
import type {SessionSample} from './sessionAnalysis'
import type {GarminRunningHrProfile} from './garminHrProfile'
import {getZoneRows} from './garminHrProfile'

export type IntensityBand = {key:string; label:string; lower:number|null; upper:number|null;count:number;share:number}
export type IntensityEvidence = {
  status:'sufficient'|'insufficient'|'no-zones'
  validSamples:number
  totalSamples:number
  classifiedSamples:number
  bands:IntensityBand[]
  belowZ1Z2Share:number|null
}
const isBpm=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=35&&x<=220
export function assessIntensity(samples:SessionSample[],profile:GarminRunningHrProfile|null):IntensityEvidence {
  const hrs=samples.map(s=>s.hr).filter(isBpm)
  const empty=(status:IntensityEvidence['status']):IntensityEvidence=>({status,validSamples:hrs.length,totalSamples:samples.length,classifiedSamples:0,bands:[],belowZ1Z2Share:null})
  if(hrs.length<80 || samples.length===0 || hrs.length/samples.length<0.75) return empty('insufficient')
  const rows=getZoneRows(profile)
  if(rows.length!==5 || rows[0].low===null || !rows.every((r,i)=>Number.isInteger(r.low)&&r.low!>=35&&r.high<=230&&(i===0 || r.low===rows[i-1].high+1))) return empty('no-zones')
  const bounds=rows.map(r=>({low:r.low!,high:r.high}))
  const bands:IntensityBand[]=[{key:'below',label:'Unter Z1',lower:null,upper:bounds[0].low-1,count:0,share:0},
    ...bounds.map((b,i)=>({key:`z${i+1}`,label:`Z${i+1}`,lower:b.low,upper:b.high,count:0,share:0})),
    {key:'above',label:'Über Z5',lower:bounds[4].high+1,upper:null,count:0,share:0}]
  for(const hr of hrs){
    let idx=hr<bounds[0].low?0:hr>bounds[4].high?6:0
    if(idx===0 && hr>=bounds[0].low){const found=bounds.findIndex(b=>hr>=b.low&&hr<=b.high);idx=found>=0?found+1:0}
    bands[idx].count++
  }
  for(const b of bands)b.share=100*b.count/hrs.length
  const belowZ1Z2Share=100*(bands[0].count+bands[1].count+bands[2].count)/hrs.length
  return {status:'sufficient',validSamples:hrs.length,totalSamples:samples.length,classifiedSamples:bands.reduce((s,b)=>s+b.count,0),bands,belowZ1Z2Share}
}
