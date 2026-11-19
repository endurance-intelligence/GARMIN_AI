export type EventMenu={
 raceName:string;raceDate:string;source:string;carbs:string[];
 saltyWarm:string[];otherDrinks:string[];caffeine:string[];
 carbDrinkStrength:'unknown';note:string
}
export type EventFoodSuggestion={
 primary:string;alternative:string;availableAtEvent:true;sideNote:string|null
}
export declare const HEARTBEAT_MENU_2026:EventMenu
export declare function eventMenuForRace(input:{
 raceName?:string;raceDate?:string
}):EventMenu|null
export declare function suggestEventFood(menu:EventMenu|null,input:{
 round?:number;longPause?:boolean;arrivalMinutes?:number
}):EventFoodSuggestion|null
