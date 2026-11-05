import { garminLocalApi } from './server/garminLocalApi.js'
import { garminConnectLocal } from './server/garminConnectLocal.js'
import { garminActivityShoeLocal } from './server/garminActivityShoeLocal.js'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), garminLocalApi(), garminConnectLocal(), garminActivityShoeLocal()],
})
