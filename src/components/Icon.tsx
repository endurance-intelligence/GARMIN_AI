import type { ReactNode } from 'react'

const iconShapes: Record<string, ReactNode> = {
"activity": <><path d="M22 12h-4l-3 9-6-18-3 9H2" /></>,
"layout-dashboard": <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
"flag": <><path d="M4 22V4m0 0c4-3 7 3 11 0s6 0 6 0v11c-4-3-7 3-11 0s-6 0-6 0" /></>,
"footprints": <><path d="M4 16.5c1.5-1.3 4-.9 5 1.3.7 1.7.3 3.2-1.3 3.9-1.9.9-5.2.2-5.7-1.6-.3-1.2.5-2.5 2-3.6ZM6 13a1 1 0 1 0-1-1 1 1 0 0 0 1 1Zm3-1a1 1 0 1 0-1-1 1 1 0 0 0 1 1Zm2-3a1 1 0 1 0-1-1 1 1 0 0 0 1 1Zm7 1.5c-1.5-1.3-4-.9-5 1.3-.7 1.7-.3 3.2 1.3 3.9 1.9.9 5.2.2 5.7-1.6.3-1.2-.5-2.5-2-3.6ZM16 7a1 1 0 1 0 1-1 1 1 0 0 0-1 1Zm-3-1a1 1 0 1 0 1-1 1 1 0 0 0-1 1Zm-2-3a1 1 0 1 0 1-1 1 1 0 0 0-1 1Z" /></>,
"settings": <><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></>,
"bell": <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
"sparkles": <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 17l.6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z" /></>,
"arrow-up-right": <><path d="M7 17 17 7M7 7h10v10" /></>,
"heart-pulse": <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8ZM2 12h6l2-4 3 8 2-4h7" /></>,
"moon": <><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /></>,
"waves": <><path d="M2 8c3-4 5 4 8 0s5-4 8 0 3 1 4 0M2 16c3-4 5 4 8 0s5-4 8 0 3 1 4 0" /></>,
"x": <><path d="M18 6 6 18M6 6l12 12" /></>,
"check": <><path d="m5 12 4 4L19 6" /></>
}

export function Icon({name,className = ''}: {name: string; className?: string}) {
  return <svg className={`ic ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconShapes[name] ?? iconShapes.activity}</svg>
}
