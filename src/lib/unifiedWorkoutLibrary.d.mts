import type {ArchiveRecord} from './workoutLibrary'
export type LibrarySource={id:string;title:string;source_number:number;review_required:boolean}
export type LibraryItem={key:string;source:LibrarySource|null;versions:ArchiveRecord[]}
export function workoutTitleKey(title:unknown):string
export function unifiedLibraryItems(sources:LibrarySource[],entries:ArchiveRecord[]):LibraryItem[]
export function libraryItemMatches(item:LibraryItem,query:string):boolean
