import { garminLocalApi } from './server/garminLocalApi.js'
import { garminConnectLocal } from './server/garminConnectLocal.js'
import { garminActivityShoeLocal } from './server/garminActivityShoeLocal.js'
import { garminConnectBootstrapLocal } from './server/garminConnectBootstrapLocal.js'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { isPublicConfig,instanceStoragePrefix } from './scripts/validate-public-config.mjs'
import { scopeBrowserStorage } from './scripts/secondary-browser-storage.mjs'

// Only the secondary Pages build scopes application-owned cache keys.
const instance=process.env.VITE_GARMIN_INSTANCE||'primary'
if(!['primary','secondary'].includes(instance))throw Error('Unknown GARMIN_AI instance')
const secondary=instance==='secondary'
const projectUrl=process.env.VITE_GARMIN_SUPABASE_URL
if(secondary&&(process.env.GITHUB_PAGES!=='true'||!isPublicConfig(projectUrl,process.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY,instance)))throw Error('Secondary Pages configuration is invalid')
const sourceRoot=fileURLToPath(new URL('./src/',import.meta.url)).replaceAll('\\','/')
const isolation:Plugin={
  name:'garmin-secondary-cache-isolation',
  enforce:'pre',
  transform(source,id){
    const path=id.split('?')[0].replaceAll('\\','/')
    if(!path.startsWith(sourceRoot)||!(/\.(?:tsx?|mjs|js|jsx)$/).test(path)||path.endsWith('/lib/instanceBrowserStorage.mjs'))return null
    const code=scopeBrowserStorage(source,path,instanceStoragePrefix(projectUrl,instance))
    return code===source?null:{code,map:null}
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? (secondary?'/GARMIN_AI/athlete/':'/GARMIN_AI/') : '/',
  plugins: [...(secondary?[isolation]:[]),react(), garminLocalApi(), garminConnectLocal(), garminActivityShoeLocal(), garminConnectBootstrapLocal()],
})
