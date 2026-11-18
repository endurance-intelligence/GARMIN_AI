/**
 * Official Komoot tour embeds. These are publisher-supported visualizations,
 * NOT a Komoot GPX API. No route geometry is extracted from this URL.
 */
export function komootEmbedFromTour(input){
 if(typeof input!=='string'||input.length>1800)return null
 try{
  const value=new URL(input.trim())
  if(value.protocol!=='https:'||value.username||value.password||value.port||
   !['komoot.com','www.komoot.com'].includes(value.hostname.toLowerCase()))return null
  const match=/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?tour\/([0-9]{5,15})(?:\/embed)?\/?$/i.exec(value.pathname)
  if(!match)return null
  const id=match[1],embed=new URL('https://www.komoot.com/tour/'+id+'/embed')
  embed.searchParams.set('hl','de')
  embed.searchParams.set('layout','classic')
  embed.searchParams.set('profile','1')
  // Shared private tours may need the token; do not invent or log one.
  const token=value.searchParams.get('share_token')
  if(token&&/^[a-z0-9_-]{8,300}$/i.test(token))embed.searchParams.set('share_token',token)
  return {id,url:embed.href,canonicalUrl:'https://www.komoot.com/tour/'+id}
 }catch{return null}
}
