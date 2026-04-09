import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  }
)

const USER_ID_KEY = 'ski-tracker-user-id'

/** Returns a persistent anonymous UUID stored in localStorage */
export function ensureAnonymousUser(): string {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY)
}
