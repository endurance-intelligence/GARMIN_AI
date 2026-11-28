import test from 'node:test'
import assert from 'node:assert/strict'
import {unifiedLibraryItems,libraryItemMatches} from '../src/lib/unifiedWorkoutLibrary.mjs'
const source={id:'s1',title:'Extensiv & zügig – 1000 m + 200 m'}
const row={id:'a1',title:'Extensiv & zügig - 1000 m + 200 m',source_kind:'orc_reference',coach_name:'ORC',source_label:'Trainer',workout:{groups:[{name:'Wolf'}]}}
test('unique legacy ORC title is organized under original, without modifying either record',()=>{
 const items=unifiedLibraryItems([source],[row])
 assert.equal(items.length,1)
 assert.equal(items[0].source,source)
 assert.deepEqual(items[0].versions,[row])
 assert.ok(libraryItemMatches(items[0],'wolf'))
 assert.ok(libraryItemMatches(items[0],'1000 m'))
})
test('different original IDs and unrelated manual entries stay independently selectable',()=>{
 const items=unifiedLibraryItems([source,{...source,id:'s2'}],[row,{...row,id:'a2',source_kind:'manual'}])
 assert.equal(items.length,4)
 assert.equal(new Set(items.map(i=>i.key)).size,4)
 assert.equal(unifiedLibraryItems([source],[{...row,source_kind:'manual'}]).length,2)
})
test('new photo and manual workouts without original stay in the same list',()=>{
 const items=unifiedLibraryItems([source],[{...row,title:'New',source_kind:'trainer_photo'},{...row,id:'a2',title:'Manual',source_kind:'manual'}])
 assert.equal(items.length,3)
 assert.equal(items[1].versions[0].title,'New')
})
