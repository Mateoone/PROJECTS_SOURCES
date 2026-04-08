import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Use placeholder values so createClient doesn't throw at import time.
// The app will show a setup screen if isSupabaseConfigured === false.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
)

/** Sign in anonymously (or return existing anonymous session) */
export async function ensureAnonymousUser(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user!.id
}

/** Get or refresh the current user ID */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}
