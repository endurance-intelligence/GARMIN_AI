/** Read-only, best effort tour data. Komoot does not offer a public API contract.
 * Only use an athlete-provided share link; no credentials, redirects or access workarounds.
 */
export function komootTourRequest(input){
 if(typeof input!=='string'||input.length>1800)return null
 try{
  const u=new URL(input.trim())
  if(u.protocol!=='https:'||u.username||u.password||u.port||
   !['komoot.com','www.komoot.com'].includes(u.hostname.toLowerCase()))return null
  const match=/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?tour\/([0-9]{5,15})(?:\/embed)?\/?$/i.exec(u.pathname)
  if(!match)return null
  const token=u.searchParams.get('share_token')
  if(token&&!/^[a-z0-9_-]{8,300}$/i.test(token))return null
  const url=new URL('https://www.komoot.com/api/v007/tours/'+match[1])
  if(token)url.searchParams.set('share_token',token)
  return {id:match[1],url:url.href}
 }catch{return null}
}
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null
function point(v){
 if(!v||typeof v!=='object')return null
 const lat=finite(v.lat,-90,90),lon=finite(v.lng,-180,180)
 return lat===null||lon===null?null:{latitude:lat,longitude:lon}
}
/** Accept only a tour with the requested id; never turn missing fields into zero. */
export function parseKomootTour(data,id){
 if(!data||typeof data!=='object'||String(data.id)!==String(id))return null
 const distanceM=finite(data.distance,100,1000000),ascentM=finite(data.elevation_up,0,30000),
  descentM=finite(data.elevation_down,0,30000),start=point(data.start_point)
 if(distanceM===null&&ascentM===null&&descentM===null&&!start)return null
 return {tourId:String(id),name:typeof data.name==='string'?data.name.slice(0,150):null,
  distanceM,ascentM:ascentM===null?null:Math.round(ascentM),
  descentM:descentM===null?null:Math.round(descentM),start}
}
