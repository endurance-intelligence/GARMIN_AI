/** Conservative, re-usable Photon result selection for Race Event Scout.
 * Never convert "city center" or a similar-named venue into an exact address.
 * Photon returns OpenStreetMap-derived data; only a venue+city+house number match
 * counts as a filled, confirmable address.
 */
function normalized(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim()
}
function identityTokens(value){
 const skip=new Set(['sport','sportpark','sportplatz','stadion','arena','city','stadt',
  'der','die','das','und','von','an','im','am','the','park','platz','halle','sportanlage',
  'sportzentrum','sporthalle','facility','center','centre']);
 return normalized(value).split(' ').filter(x=>x.length>=3&&!skip.has(x))
}
function sameCity(a,b){
 const aa=normalized(a),bb=normalized(b)
 return aa.length>=3&&bb.length>=3&&(aa===bb||aa.startsWith(bb+' ')||bb.startsWith(aa+' '))
}
export function venueAddressMatch(venue,city,features){
 if(typeof venue!=='string'||typeof city!=='string'||!venue.trim()||!city.trim()||!Array.isArray(features))
  return null
 const important=identityTokens(venue)
 if(important.length===0)return null
 const hits=[]
 for(const f of features.slice(0,8)){
  const p=f?.properties||{},candidateName=String(p.name||'')
  const candidateCity=String(p.city||p.town||p.village||'')
  if(!sameCity(city,candidateCity))continue
  const label=normalized(candidateName),tokens=identityTokens(candidateName)
  const shared=important.filter(t=>tokens.some(x=>x===t||x.length>=6&&(x.includes(t)||t.includes(x))))
  const ratio=shared.length/important.length
  if(ratio<0.7)continue
  const street=String(p.street||'').trim(),number=String(p.housenumber||'').trim()
  const zip=String(p.postcode||'').trim()
  const coords=f.geometry?.coordinates
  if(!street||!number||!zip||!/^[a-z0-9\s\-\/]{2,15}$/i.test(number))continue
  if(!/^[0-9a-z][0-9a-z\s-]{2,11}$/i.test(zip))continue
  if(!Array.isArray(coords)||coords.length<2||
   !Number.isFinite(coords[0])||!Number.isFinite(coords[1]))continue
  const lat=Number(coords[1]),lon=Number(coords[0])
  if(Math.abs(lat)>90||Math.abs(lon)>180)continue
  const full=[street+' '+number,zip+' '+candidateCity].join(', ')
  const osmType=String(p.osm_type||'').toUpperCase()
  const osmId=Number(p.osm_id)
  const source=osmType&&['N','W','R','NODE','WAY','RELATION'].includes(osmType)&&
   Number.isSafeInteger(osmId)&&osmId>0
    ?'https://www.openstreetmap.org/'+
      ({N:'node',W:'way',R:'relation',NODE:'node',WAY:'way',RELATION:'relation'})[osmType]+'/'+osmId
    :'https://www.openstreetmap.org/?mlat='+lat+'&mlon='+lon+'#map=18/'+lat+'/'+lon
  hits.push({address:full,source,provider:'OpenStreetMap / Photon',
   matchedVenue:candidateName,matchedCity:candidateCity,lat,lon,confidence:ratio===1?'high':'medium',
   score:ratio+(label===normalized(venue)?0.3:0)})
 }
 hits.sort((a,b)=>b.score-a.score)
 // Similar-ranked distinct physical addresses are not safe to autofill.
 if(hits.length>1&&hits[0].address!==hits[1].address&&hits[0].score-hits[1].score<0.15)
  return null
 return hits[0]||null
}
export function photonLookupURL(venue,city){
 if(!venue||!city||String(venue).length>150||String(city).length>100)
  throw Error('Missing venue or city')
 const url=new URL('https://photon.komoot.io/api/')
 url.searchParams.set('q',String(venue).trim()+', '+String(city).trim())
 url.searchParams.set('limit','8')
 url.searchParams.set('lang','de')
 return url.href
}
