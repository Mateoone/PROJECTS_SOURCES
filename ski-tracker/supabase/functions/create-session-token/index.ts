/**
 * Edge Function: create-session-token
 *
 * Two modes:
 * 1. Create: { session_id, user_id }  → returns { token: "<uuid>" }
 *    Only the session admin can call this. Returns the join_token stored in DB.
 *
 * 2. Verify: { session_id, verify_token } → returns { valid: true } or 401
 *    Anyone with the token can verify it (no user_id required).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { session_id, user_id, verify_token } = await req.json()

    if (!session_id) return json({ error: 'session_id required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: session, error } = await supabase
      .from('sessions')
      .select('id, expires_at, admin_id, join_token')
      .eq('id', session_id)
      .single()

    if (error || !session) return json({ error: 'Session not found' }, 404)
    if (new Date(session.expires_at) < new Date()) return json({ error: 'Session expired' }, 410)

    // VERIFY mode — check token matches
    if (verify_token) {
      if (session.join_token === verify_token) {
        return json({ valid: true })
      }
      return json({ error: 'Invalid token' }, 401)
    }

    // CREATE mode — only admin gets the token
    if (user_id !== session.admin_id) {
      return json({ error: 'Only admin can get the token' }, 403)
    }

    return json({ token: session.join_token })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return json({ error: msg }, 500)
  }
})
