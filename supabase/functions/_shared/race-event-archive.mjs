/** Photon suggestion formatting – do not infer unprovided street/house numbers.
 * Browser only receives name, city, formatted address and source URL.
 */
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
export function formatVenueSuggestions(features,cityHint=''){
 if(!Array.isArray(features))return [];
 const seen=new Set(),out=[];
 for(const feature of features.slice(0,14)){
  const p=feature?.properties||{},name=clean(p.name),city=clean(p.city||p.town||p.village);
  if(!name||(!city&&!cityHint))continue;
  const street=clean(p.street),number=clean(p.housenumber),postcode=clean(p.postcode);
  const complete=!!street&&!!number&&!!postcode&&!!city;
  const address=complete?street+' '+number+', '+postcode+' '+city:null;
  const shortAddress=[street,number,postcode,city||cityHint].filter(Boolean).join(' ');
  const coords=feature?.geometry?.coordinates;
  if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(coords[0])||!Number.isFinite(coords[1]))continue;
  const osmType=String(p.osm_type||'').toUpperCase(),osmId=Number(p.osm_id);
  const type=({N:'node',W:'way',R:'relation',NODE:'node',WAY:'way',RELATION:'relation'})[osmType];
  const source=type&&Number.isSafeInteger(osmId)&&osmId>0
   ?'https://www.openstreetmap.org/'+type+'/'+osmId
   :'https://www.openstreetmap.org/?mlat='+Number(coords[1])+'&mlon='+Number(coords[0]);
  const id=source+'|'+name+'|'+address;
  if(seen.has(id))continue;
  seen.add(id);
  out.push({name:name.slice(0,150),city:(city||cityHint).slice(0,100),address,
   subtitle:shortAddress.slice(0,190),source,hasFullAddress:complete});
  if(out.length===6)break;
 }
 return out;
}
export function archiveCanonicalUrl(input){
 const value=new URL(input);
 if(value.protocol!=='https:')throw Error('HTTPS needed');
 value.hash='';value.search='';
 const path=value.pathname.replace(/\/+$/,'');
 value.pathname=path||'/';
 return value.href;
}
/** Race edition date is never copied from last year's event. */
export function archiveForNewEdition(template,raceDate){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raceDate))throw Error('Invalid goal date');
 const src=template&&typeof template==='object'?template:{};
 return {...src,eventDate:raceDate};
}
