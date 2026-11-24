/** Only bounded raster images, never arbitrary URLs, SVG or HTML. */
export const LOGO_PREFIX='data:image/webp;base64,'
export const MAX_LOGO_LENGTH=350000
export function validGoalLogo(value){
 if(value==='')return true
 if(typeof value!=='string'||value.length>MAX_LOGO_LENGTH||!value.startsWith(LOGO_PREFIX))return false
 const base=value.slice(LOGO_PREFIX.length)
 if(!base||base.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(base))return false
 try{
  const s=atob(base)
  if(s.length<20||s.length>256*1024||s.slice(0,4)!=='RIFF'||s.slice(8,12)!=='WEBP')return false
  const len=s.charCodeAt(4)+s.charCodeAt(5)*256+s.charCodeAt(6)*65536+s.charCodeAt(7)*16777216
  return len+8===s.length&&['VP8 ','VP8L','VP8X'].includes(s.slice(12,16))
 }catch{return false}
}
