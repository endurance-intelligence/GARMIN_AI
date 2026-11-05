/**
 * Development-only localhost adapter for the SANITIZED Garmin Connect report.
 * Never reads token files, and never exposes raw Garmin credentials.
 */
import type { Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

type Data = Record<string, unknown>
const record = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const str = (value: unknown, max = 180): string | null =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null
const id = (value: unknown): string | null => {
  const t = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  return typeof t === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(t) ? t : null
}

export function sanitizedReport(raw: unknown) {
  const data = record(raw)
  if (data.readOnly !== true || data.source !== 'Garmin Connect (unofficial)') throw new Error('invalid-report')
  const gearData = record(data.gear), scheduleData = record(data.schedule), linkData = record(data.activityGear)
  if ([gearData,scheduleData,linkData].some(x=>x.status !== 'ok')) throw new Error('incomplete-report')
  const gearRaw = array(gearData.items), scheduleRaw = array(scheduleData.items), linkRaw = array(linkData.items)
  if (gearRaw.length>250 || scheduleRaw.length>500 || linkRaw.length>250) throw new Error('report-too-large')
  const gear = gearRaw.map(value=>{
    const row=record(value), gearId=id(row.id)
    if(!gearId) throw new Error('invalid-gear-id')
    const model=str(row.model), name=str(row.name), brand=str(row.brand)
    return {id:gearId,name:(model || name || brand || 'Equipment') +
      (name && name !== model ? ' · '+name : ''),model,brand,type:str(row.type)}
  })
  const schedule=scheduleRaw.map(value=>{
    const row=record(value),date=str(row.date,10)
    if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid-date')
    return {date,id:id(row.id),workoutId:id(row.workoutId),name:str(row.name),sport:str(row.sport),restDay:row.restDay===true}
  })
  const activityId = id(data.activityId)
  if(!activityId || !/^\d{5,20}$/.test(activityId)) throw new Error('invalid-activity-id')
  const activityGear = linkRaw.map(value=>{
    const row=record(value),gearId=id(row.id)
    if(!gearId || !gear.some(g=>g.id===gearId)) throw new Error('gear-link-not-in-catalog')
    return {activityId,gearId}
  })
  const checkedAt = str(data.checkedAt,40)
  if(!checkedAt || !Number.isFinite(Date.parse(checkedAt))) throw new Error('invalid-time')
  return {source:'Garmin Connect (unofficial)',readOnly:true,checkedAt,gear,schedule,activityGear}
}

export function garminConnectLocal(): Plugin {
  return {name:'garmin-connect-local-report-only',apply:'serve',configureServer(server){
    server.middlewares.use('/api/garmin-context-local', async (req,res)=>{
      const host=req.headers.host || ''
      const remote=req.socket.remoteAddress || ''
      const localhost = /^(localhost|127\.0\.0\.1):517[3-9]$/.test(host)
      const loopback = remote === '::1' || remote === '127.0.0.1' || remote === '::ffff:127.0.0.1'
      const origin=req.headers.origin
      res.setHeader('Content-Type','application/json; charset=utf-8')
      res.setHeader('Cache-Control','private, no-store')
      res.setHeader('X-Content-Type-Options','nosniff')
      if(!localhost || !loopback || (origin && origin !== 'http://'+host)) {
        res.statusCode=403;res.end('{"error":"Local-only"}');return
      }
      if(req.method!=='GET') {res.statusCode=405;res.end('{"error":"Read-only"}');return}
      if(req.url?.split('?')[0] !== '/snapshot') {
        res.statusCode=404;res.end('{"error":"Not found"}');return
      }
      try {
        const root=process.env.LOCALAPPDATA || join(homedir(),'.local','share')
        const path=join(root,'GARMIN_AI','garmin-connect-check.json')
        const raw=await readFile(path,'utf8')
        if(raw.length>150000) throw new Error('large-report')
        res.statusCode=200
        res.end(JSON.stringify(sanitizedReport(JSON.parse(raw) as unknown)))
      } catch {
        res.statusCode=404;res.end('{"error":"No valid local Garmin Connect report. Re-run the local verification."}')
      }
    })
  }}
}
