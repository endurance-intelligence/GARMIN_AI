import { createClient } from '@supabase/supabase-js'

// The Vite publishable key is PUBLIC. Never place any secret/service-role key here.
export const garminSupabaseUrl = import.meta.env.VITE_GARMIN_SUPABASE_URL || ''
export const garminPublishableKey = import.meta.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY || ''
export const garminSupabaseReady = Boolean(garminSupabaseUrl && garminPublishableKey)

export const garminSupabase = garminSupabaseReady
  ? createClient(garminSupabaseUrl, garminPublishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null
