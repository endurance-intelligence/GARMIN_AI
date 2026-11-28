/** One picker; never merge or delete original workout records.
 * Legacy archive rows have no source UUID. A unique normalized title may
 * organize them under an original, but does not establish identity.
 * Ambiguous matches stay separately selectable. Each imported ID is retained.
 */
export function workoutTitleKey(title){
 return String(title??'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[–—−]/g,'-').replace(/\s+/g,' ').replace(/\s*-\s*/g,'-').trim()
}
export function unifiedLibraryItems(sources,entries){
 const items=sources.map(source=>({key:'original:'+source.id,source,versions:[]}))
 const byTitle=new Map()
 for(const item of items){
  const key=workoutTitleKey(item.source.title)
  const matches=byTitle.get(key)||[]
  matches.push(item);byTitle.set(key,matches)
 }
 for(const record of entries){
  const matches=byTitle.get(workoutTitleKey(record.title))||[]
  // Never hide an unrelated manual workout just because it has the same title.
  if(matches.length===1&&record.source_kind==='orc_reference')matches[0].versions.push(record)
  else items.push({key:'archive:'+record.id,source:null,versions:[record]})
 }
 return items
}
export function libraryItemMatches(item,query){
 const needle=workoutTitleKey(query)
 if(!needle)return true
 return [item.source?.title,...item.versions.flatMap(record=>[record.title,record.coach_name,record.source_label,...record.workout.groups.map(g=>g.name)])].some(v=>workoutTitleKey(v).includes(needle))
}
