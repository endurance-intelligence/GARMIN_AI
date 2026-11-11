/**
 * Conservative event-page discovery. Does not invent unknown data.
 * This parser is pure and can run under Node's test runner and Deno Edge.
 */
const replacements={"amp":"&","quot":"\"","apos":"'","nbsp":" ","auml":"ä","ouml":"ö","uuml":"ü","Auml":"Ä","Ouml":"Ö","Uuml":"Ü","szlig":"ß","ndash":"–","mdash":"—"};
export function decodeEntities(s){
 return String(s||"").replace(/&(#x[0-9a-f]+|#[0-9]+|[a-zA-Z]+);/g,(_,v)=>{
  if(v[0]==="#"){
   const cp=v[1]?.toLowerCase()==="x"?parseInt(v.slice(2),16):parseInt(v.slice(1),10);
   return Number.isFinite(cp)&&cp>0&&cp<0x110000?String.fromCodePoint(cp):" ";
  }
  return replacements[v]??" ";
 });
}
const strip=(s)=>decodeEntities(String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim());
export function safeWebsiteUrl(value){
 if(typeof value!=="string"||value.length>1800)throw Error("Ungültige Website-Adresse");
 let url;
 try{url=new URL(value.trim())}catch{throw Error("Bitte vollständige HTTPS-Adresse eingeben.")}
 if(url.protocol!=="https:"||url.username||url.password||url.port)
  throw Error("Nur öffentliche HTTPS-Webseiten ohne Sonderport sind erlaubt.");
 const host=url.hostname.toLowerCase();
 if(host.length>253||host.indexOf(".")===-1||
   !/^[a-z0-9.-]+$/.test(host)||host.startsWith("-")||
   /(?:^|\.)(localhost|local|internal|test|invalid|example|home|lan)$/.test(host)||
   /^\d+$/.test(host)||/^\d+\.\d+\.\d+\.\d+$/.test(host)||
   host.includes("..")||host.endsWith(".")||host.endsWith(".localhost"))
   throw Error("Nur öffentlich erreichbare Veranstalter-Webseiten sind erlaubt.");
 url.hash="";return url.href;
}
function anchors(html,base){
 const results=[];
 for(const match of String(html).matchAll(/<a\b([^>]{0,2000})>([\s\S]*?)<\/a>/gi)){
  const attrs=match[1];
  const href=/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attrs);
  if(!href)continue;
  try{
   const url=new URL(decodeEntities(href[1]||href[2]||href[3]),base);
   if(url.protocol==="https:"&&url.username===""&&url.password===""){
    url.hash="";
    results.push({url:url.href,label:strip(match[2]).slice(0,130)});
   }
  }catch{}
 }
 return results;
}
function textOf(html){
 return decodeEntities(
  String(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi," ")
  .replace(/<\/(?:p|div|section|article|li|h[1-6]|br|tr|ul|ol)>/gi,"\n")
  .replace(/<br\s*\/?>/gi,"\n")
  .replace(/<[^>]*>/g," ")
  .replace(/[ \t]+/g," ")
  .replace(/\n[ \t]*/g,"\n")
  .replace(/\n{3,}/g,"\n\n")
 ).slice(0,350000);
}
function dateISO(y,m,d){
 const str=String(y)+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
 const date=new Date(str+"T12:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===str?str:null;
}
const months={januar:1,februar:2,märz:3,maerz:3,april:4,mai:5,juni:6,juli:7,august:8,september:9,oktober:10,november:11,dezember:12,
 january:1,february:2,march:3,may:5,june:6,july:7,october:10,december:12};
export function extractDates(text){
 const data=new Set();
 for(const m of text.matchAll(/\b(20\d\d)-([01]?\d)-([0-3]?\d)(?:T\d\d:\d\d)?\b/g)){
  const d=dateISO(+m[1],+m[2],+m[3]);if(d)data.add(d);
 }
 for(const m of text.matchAll(/\b([0-3]?\d)\.([01]?\d)\.(20\d\d)\b/g)){
  const d=dateISO(+m[3],+m[2],+m[1]);if(d)data.add(d);
 }
 for(const m of text.matchAll(/\b([0-3]?\d)\.?\s+(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|May|June|July|August|September|October|November|December)\s+(20\d\d)\b/gi)){
  const d=dateISO(+m[3],months[m[2].toLowerCase()],+m[1]);if(d)data.add(d);
 }
 return [...data].sort();
}
function jsonLdBlocks(html){
 const result=[];
 for(const item of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/type\s*=\s*["']application\/ld\+json["']/i.test(item[1]))continue;
  try{const value=JSON.parse(item[2].trim());const flatten=(v,depth=0)=>{
   if(depth>4||!v||typeof v!=="object")return;
   if(Array.isArray(v)){v.forEach(x=>flatten(x,depth+1));return;}
   result.push(v);
   if(v["@graph"])flatten(v["@graph"],depth+1);
   if(v.subEvent)flatten(v.subEvent,depth+1);
  };flatten(value)}catch{}
 }
 return result;
}
const safeText=(s,max=140)=>strip(s).slice(0,max);
function time(value){
 const input=String(value||"");
 const m=/T([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(input)||/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(input);
 return m?String(+m[1]).padStart(2,"0")+":"+m[2]:null;
}
function routeFrom(links){
 const result={routeUrl:null,gpxUrl:null};
 for(const link of links){
  const label=link.label.toLowerCase();
  const url=link.url;
  if(!result.gpxUrl&&/\.gpx(?:[?#]|$)/i.test(url))result.gpxUrl=url;
  if(!result.routeUrl&&(/komoot\.com\/(?:de-de\/)?tour\/\d+/i.test(url)||
   /(?:strava\.com\/routes\/|outdooractive\.com\/.*(?:route|tour)|alltrails\.com\/trail\/)/i.test(url)||
   /(strecke|route|gpx|track)/i.test(label)&&/\.(?:gpx|fit|kml)(?:[?#]|$)/i.test(url)))
   result.routeUrl=url;
 }
 return result;
}
function eventBlocks(page){
 const data=jsonLdBlocks(page.html);
 return data.filter(x=>{
  const type=x["@type"];
  return (Array.isArray(type)?type:[type]).some(t=>typeof t==="string"&&/Event$/i.test(t));
 });
}
export function parseEventPages(pages,{raceDateHint=null,raceNameHint=""}={}){
 if(!Array.isArray(pages)||!pages.length)throw Error("Keine Websiteinhalte vorhanden.");
 const allLinks=[],allText=[],sources=[];
 const details={
  eventName:null,eventDate:null,startTime:null,endTime:null,
  venue:null,venueAddress:null,city:null,officialLoopKm:null,
  routeUrl:null,gpxUrl:null,routeNotes:null,maximumDistanceKm:null
 };
 const set=(field,value,page,evidence)=>{
  if(details[field]!==null||value===null||value===undefined||value==="")return;
  details[field]=value;
  sources.push({field,url:page.url,evidence:safeText(evidence||String(value),180)});
 };
 const getSource=(field)=>sources.find(x=>x.field===field);
 for(const page of pages){
  const text=textOf(page.html),lines=text.split("\n").map(s=>s.trim()).filter(Boolean);
  allText.push(text);
  const links=anchors(page.html,page.url);
  allLinks.push(...links);
  const ld=eventBlocks(page);
  for(const item of ld){
   const name=typeof item.name==="string"?item.name:null;
   if(name&&/(lauf|run|ultra|race|marathon|trail|event|triathlon|rennen|sprint|challenge)/i.test(name))
    set("eventName",safeText(name,150),page,name);
   const ldDate=String(item.startDate||"");
   const iso=extractDates(ldDate)[0]||null;
   if(iso&&(!raceDateHint||raceDateHint===iso))set("eventDate",iso,page,ldDate);
   if(item.startDate&&time(ldDate))set("startTime",time(ldDate),page,ldDate);
   if(item.endDate&&time(item.endDate))set("endTime",time(item.endDate),page,item.endDate);
   const location=item.location;
   if(location&&typeof location==="object"){
    if(location.name)set("venue",safeText(location.name,150),page,location.name);
    if(location.address){
     const a=location.address;
     if(typeof a==="string")set("venueAddress",safeText(a,190),page,a);
     else if(a&&typeof a==="object"){
      const street=[a.streetAddress,a.postalCode,a.addressLocality].filter(Boolean).join(", ");
      if(street)set("venueAddress",safeText(street,190),page,street);
      if(a.addressLocality)set("city",safeText(a.addressLocality,90),page,a.addressLocality);
     }
    }
   }
  }
  const dates=extractDates(text);
  if(raceDateHint&&dates.includes(raceDateHint))set("eventDate",raceDateHint,page,raceDateHint);
  else if(dates.length===1)set("eventDate",dates[0],page,dates[0]);
  const title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1]||"";
  const cleanTitle=safeText(title.split(/\s+[|–-]\s+/)[0],150);
  if(cleanTitle&&/(lauf|run|ultra|race|marathon|trail|rennen)/i.test(cleanTitle))
   set("eventName",cleanTitle,page,cleanTitle);
  const start=/\b(?:Start(?:\/Ziel)?|Starts?\s+at|Startzeit|Beginn)\s*:?\s*(?:ab|um|at)?\s*([01]?\d|2[0-3])[:.]([0-5]\d)/i.exec(text);
  if(start)set("startTime",String(+start[1]).padStart(2,"0")+":"+start[2],page,start[0]);
  const end=/\b(?:Ziel(?:schluss)?|Ende|Finish)\s*:?\s*(?:bis|um|at)?\s*([01]?\d|2[0-3])[:.]([0-5]\d)/i.exec(text);
  if(end)set("endTime",String(+end[1]).padStart(2,"0")+":"+end[2],page,end[0]);
  if(/\bSportpark Johannisau\b/i.test(text))set("venue","Sportpark Johannisau",page,"Sportpark Johannisau");
  for(const line of lines){
   const venue=/^(?:Start\/Ziel|WO|Ort|Location|Venue)\s*:\s*(.{5,155})$/i.exec(line);
   if(venue&&!details.venue&&!/^\d/.test(venue[1]))
    set("venue",safeText(venue[1].replace(/\s*\(.*$/,""),130),page,line);
   const city=/\b(?:in|bei)\s+(Fulda|Berlin|Hamburg|München|Köln|Bielefeld|Frankfurt|Hannover|Kassel|Dresden|Leipzig)\b/i.exec(line);
   if(city)set("city",city[1],page,line);
   const loop=/\b(?:ca\.?\s*|rund\s*|circa\s*)?(\d{1,2}(?:[,.]\d{1,2})?)\s*km\s+(?:flach\w*\s+)?(?:Rundkurs|Runde|rundkurs|langen?\s+Runde|loop)/i.exec(line)
    ||/\b(?:Runde|Rundkurs|loop)\s*(?:über|von|mit|:)?\s*(?:ca\.?\s*|rund\s*)?(\d{1,2}(?:[,.]\d{1,2})?)\s*km\b/i.exec(line);
   if(loop){
    const km=Number(loop[1].replace(",","."));
    if(km>0&&km<=100)set("officialLoopKm",km,page,line);
   }
   const max=/(?:bis(?:\s+zu)?|max(?:imal)?\.?)\s+(\d{2,3})\s*km\b/i.exec(line);
   if(max){
    const km=+max[1];if(km<=500)set("maximumDistanceKm",km,page,line);
   }
   if(!details.routeNotes&&/\b(?:strecke|rundkurs|route|trail)\b/i.test(line)&&
      /\b(?:flach|befestigt|schotter|asphalt|trail|hügel|höhenmeter|gravel)\b/i.test(line)){
    set("routeNotes",safeText(line,210),page,line);
   }
  }
 }
 const links=routeFrom(allLinks);
 if(links.routeUrl){
  const p=pages.find(p=>allLinks.some(l=>l.url===links.routeUrl&&l.url.startsWith(p.url.replace(/\/[^/]*$/,"/"))))||pages[0];
  set("routeUrl",links.routeUrl,p,allLinks.find(l=>l.url===links.routeUrl)?.label||"Streckenlink");
 }
 if(links.gpxUrl)set("gpxUrl",links.gpxUrl,pages[0],"GPX-Downloadlink");
 if(!details.eventName&&raceNameHint)details.eventName=safeText(raceNameHint,150);
 // Never fill personal target distance from an event lap / max distance.
 const missing=["eventDate","venue","startTime","officialLoopKm","routeUrl"]
  .filter(k=>details[k]===null);
 return {details,sources,missing,discoveredPages:pages.map(x=>x.url)};
}
export function rankEventPages(rootUrl,html){
 const base=new URL(rootUrl);
 const candidates=anchors(html,rootUrl).filter(l=>{
  const u=new URL(l.url);
  if(u.origin!==base.origin)return false;
  if(l.url===rootUrl||/\.(pdf|png|jpe?g|webp|zip|gpx)(?:[?#]|$)/i.test(l.url))return false;
  return true;
 });
 const used=new Set(),score=l=>{
  const str=(l.label+" "+new URL(l.url).pathname).toLowerCase();
  return (/(?:das-event|strecke|route|course|track|gpx|parcours)/.test(str)?7:0)+
   (/(?:details|ausschreibung|infos?|wettkampf|rennen|race|event|about|ablauf|datum)/.test(str)?4:0);
 };
 return candidates.filter(x=>{if(used.has(x.url))return false;used.add(x.url);return score(x)>0})
 .sort((a,b)=>score(b)-score(a)).slice(0,4);
}


/** Extract actual publisher-supplied image URLs. Not an AI-generated logo. */
export function discoverEventLogo(pages){
 const picks=[];
 const attr=(tag,name)=>{
  const expression=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]+)"|\\x27([^\\x27]+)\\x27|([^\\s>]+))','i');
  const found=expression.exec(tag);return found?decodeEntities(found[1]||found[2]||found[3]):'';
 };
 for(const page of pages){
  const html=String(page.html||'');
  for(const tag of html.match(/<(?:img|link|meta)\b[^>]{1,3000}>/gi)||[]){
   const type=/^<img\b/i.test(tag)?'img':/^<link\b/i.test(tag)?'link':'meta';
   const rel=attr(tag,'rel').toLowerCase(),alt=attr(tag,'alt').toLowerCase();
   const prop=(attr(tag,'property')||attr(tag,'name')).toLowerCase();
   const uri=type==='img'?
    attr(tag,'data-src')||attr(tag,'data-image')||attr(tag,'src'):
    type==='link'?attr(tag,'href'):attr(tag,'content');
   if(!uri||uri.startsWith('data:'))continue;
   let url;
   try{url=new URL(uri,page.url)}catch{continue}
   if(url.protocol!=='https:'||url.username||url.password||url.port||
      !/\.(?:svg|png|jpe?g|webp|ico)(?:$|[?#])/i.test(url.href)&&
      !/images\.squarespace-cdn\.com/i.test(url.hostname))continue;
   url.hash='';
   if(url.href.length>1500)continue;
   let score=-1;
   const path=url.pathname.toLowerCase();
   if(type==='img'&&/logo|emblem|brand|mark/.test(alt))score=100;
   else if(type==='img'&&/(?:logo|emblem|brand)[_-]/.test(path))score=95;
   else if(type==='link'&&/\b(?:apple-touch-icon|icon)\b/.test(rel))score=80;
   else if(type==='meta'&&/^(og:image|twitter:image)$/.test(prop)&&/logo|emblem|brand/.test(path))score=60;
   if(score>=0)picks.push({url:url.href,source:page.url,score});
  }
 }
 picks.sort((a,b)=>b.score-a.score);
 return picks.length?{url:picks[0].url,source:picks[0].source,kind:picks[0].score>=95?'site_logo':'site_icon'}:null;
}
