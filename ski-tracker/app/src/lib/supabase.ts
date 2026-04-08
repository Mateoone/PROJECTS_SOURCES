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

/** Return the current authenticated user ID (Google or any provider).
 *  Throws if not signed in — callers should redirect to home. */
export async function ensureAnonymousUser(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user.id
  throw new Error('NOT_AUTHENTICATED')
}

/** Get or refresh the current user ID */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

/** Sign in with Google OAuth (redirects back to app) */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })
  if (error) throw error
}

/** Sign out current user */
export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut()
}
