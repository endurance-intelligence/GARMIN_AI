export type EquipmentId='bodyweight'|'rowing'|'treadmill'|'bike'|'trainer'
export type EquipmentProfile={available:EquipmentId[];treadmillMaxInclinePct:number|null}
export const EQUIPMENT_OPTIONS:Array<{id:EquipmentId;label:string;description:string}>
export function normalizeEquipmentProfile(value:unknown):EquipmentProfile|null
export function hasEquipment(profile:unknown,kind:EquipmentId|'cycling'):boolean
