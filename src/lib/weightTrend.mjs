/** Meaningful weight trends: sample counts matter; daily fluid swings are not fat changes. */
const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=30&&x<=300
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2:null}
export function weightTrend(rows,asOf){
 if(!Array.isArray(rows)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(asOf))return null
 const unique=new Map()
 for(const row of rows){
  const date=String(row?.weigh_date||''),kg=Number(row?.weight_kg)
  if(date<=asOf&&date>=shift(asOf,-89)&&valid(kg)&&!unique.has(date))unique.set(date,kg)
 }
 const window=(from,to)=>[...unique.entries()].filter(([d])=>d>=shift(asOf,from)&&d<=shift(asOf,to)).map(([,v])=>v)
 const seven=window(-6,0),prevSeven=window(-13,-7),month=window(-27,0),prevMonth=window(-55,-28)
 const summary=seven.length>=4&&prevSeven.length>=4?
  {current:median(seven),previous:median(prevSeven),change:Math.round((median(seven)-median(prevSeven))*10)/10}:null
 return {latest:[...unique.entries()].sort((a,b)=>b[0].localeCompare(a[0]))[0]||null,
  seven:seven.length>=4?{median:median(seven),count:seven.length}:null,
  month:month.length>=8?{median:median(month),count:month.length}:null,
  change:summary,monthlyChange:month.length>=8&&prevMonth.length>=8?
   Math.round((median(month)-median(prevMonth))*10)/10:null,
  entries:unique.size}
}
