/**
 * Edge Function: create-session-token
 *
 * Two modes:
 * 1. Create: { session_id, user_id }  → returns { token: "<jwt>" }
 * 2. Verify: { session_id, user_id, verify_token } → returns { valid: true } or 401
 *
 * The JWT is signed with SUPABASE_JWT_SECRET and encodes { session_id, iat, exp }.
 * It intentionally does NOT encode user_id so the same QR code works for all members.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, verify, getNumericDate } from 'https://deno.land/x/djwt@v3.0.0/mod.ts'

const JWT_EXPIRY_HOURS = 12

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET')
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not set')
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const { session_id, user_id, verify_token } = await req.json()

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400 })
    }

    // Initialize Supabase admin client to validate session exists
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: session, error } = await supabase
      .from('sessions')
      .select('id, expires_at, admin_id')
      .eq('id', session_id)
      .single()

    if (error || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 })
    }

    if (new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired' }), { status: 410 })
    }

    const key = await getKey()

    // VERIFY mode
    if (verify_token) {
      try {
        const payload = await verify(verify_token, key)
        if (payload.session_id !== session_id) throw new Error('session_id mismatch')
        return new Response(JSON.stringify({ valid: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
      }
    }

    // CREATE mode — only admin can generate tokens
    if (user_id !== session.admin_id) {
      return new Response(JSON.stringify({ error: 'Only admin can create tokens' }), { status: 403 })
    }

    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        session_id,
        iat: getNumericDate(0),
        exp: getNumericDate(JWT_EXPIRY_HOURS * 3600),
      },
      key
    )

    return new Response(JSON.stringify({ token }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
