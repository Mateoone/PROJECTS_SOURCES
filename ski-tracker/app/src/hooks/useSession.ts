import { useEffect } from 'react'
import { supabase, ensureAnonymousUser } from '@/lib/supabase'
import { useSessionStore } from '@/stores/sessionStore'

/** Bootstrap: ensure anonymous auth and load existing session from DB */
export function useSessionBootstrap() {
  const setUserId = useSessionStore((s) => s.setUserId)
  const session = useSessionStore((s) => s.session)
  const setSession = useSessionStore((s) => s.setSession)
  const setMembers = useSessionStore((s) => s.setMembers)
  const setPOIs = useSessionStore((s) => s.setPOIs)

  useEffect(() => {
    ensureAnonymousUser().then(setUserId).catch(console.error)
  }, [setUserId])

  useEffect(() => {
    if (!session) return

    // Load members
    supabase
      .from('team_members')
      .select('*')
      .eq('session_id', session.id)
      .then(({ data }) => data && setMembers(data))

    // Load POIs
    supabase
      .from('pois')
      .select('*')
      .eq('session_id', session.id)
      .eq('active', true)
      .then(({ data }) => data && setPOIs(data))

  }, [session, setMembers, setPOIs])
}
