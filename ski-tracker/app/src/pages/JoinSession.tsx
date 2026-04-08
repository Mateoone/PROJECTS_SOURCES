import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, ensureAnonymousUser, signInWithGoogle } from '@/lib/supabase'
import { useSessionStore, pickAvatarColor } from '@/stores/sessionStore'
import { QRScanner } from '@/components/QRCode/QRScanner'

type Step = 'scan' | 'enter-name' | 'joining'

export function JoinSession() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<Step>('scan')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const setSession = useSessionStore((s) => s.setSession)
  const setUserId = useSessionStore((s) => s.setUserId)
  const googleUser = useSessionStore((s) => s.googleUser)

  // Handle direct URL join (link share)
  useEffect(() => {
    const d = params.get('d')
    if (d) {
      try {
        const { s, t } = JSON.parse(d)
        if (s && t) {
          setSessionId(s)
          setToken(t)
          setStep('enter-name')
        }
      } catch {
        setError('Lien invalide')
      }
    }
  }, [params])

  const handleScanned = (sId: string, tok: string) => {
    setSessionId(sId)
    setToken(tok)
    setStep('enter-name')
  }

  const handleJoin = async () => {
    if (!name.trim() || !sessionId || !token) return
    setStep('joining')
    setError(null)

    try {
      const userId = await ensureAnonymousUser()
      setUserId(userId)

      // Verify token via Edge Function
      const { error: verifyErr } = await supabase.functions.invoke(
        'create-session-token',
        { body: { session_id: sessionId, verify_token: token, user_id: userId } }
      )
      if (verifyErr) throw new Error('Token invalide ou session expirée')

      // Fetch session details
      const { data: sessionData, error: sessionErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (sessionErr) throw sessionErr

      // Count existing members to pick color
      const { count } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)

      // Upsert member
      const { error: memberErr } = await supabase.from('team_members').upsert(
        {
          session_id: sessionId,
          user_id: userId,
          display_name: name.trim(),
          avatar_color: pickAvatarColor(count ?? 1),
        },
        { onConflict: 'session_id,user_id' }
      )
      if (memberErr) throw memberErr

      setSession(sessionData, false)
      navigate(`/session/${sessionId}`, { replace: true })
    } catch (e) {
      console.error('handleJoin error:', e)
      if (e instanceof Error && e.message === 'NOT_AUTHENTICATED') {
        setError('Connecte-toi avec Google avant de rejoindre une session')
      } else {
        const msg =
          e instanceof Error ? e.message
          : (e as { message?: string })?.message
          ?? JSON.stringify(e)
        setError(msg || 'Erreur lors de la connexion')
      }
      setStep('enter-name')
    }
  }

  // Require Google sign-in to join
  if (!googleUser && step === 'scan') {
    return (
      <div style={pageStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(16px + var(--safe-top)) 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 16, cursor: 'pointer', minHeight: 44 }}>← Retour</button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>Rejoindre</h2>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
          <span style={{ fontSize: 48 }}>🎿</span>
          <p style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', maxWidth: 280 }}>
            Connecte-toi avec Google pour rejoindre une session
          </p>
          <button
            onClick={() => signInWithGoogle()}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#fff', border: 'none', borderRadius: 14,
              padding: '14px 28px', color: '#1f2937',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 52,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuer avec Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(16px + var(--safe-top)) 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={() => step === 'enter-name' ? setStep('scan') : navigate('/')}
          style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 16, cursor: 'pointer', minHeight: 44 }}
        >
          ← Retour
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
          {step === 'scan' ? 'Scanner le QR code' : 'Ton prénom'}
        </h2>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px calc(24px + var(--safe-bottom))' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 10, padding: '10px 14px', marginBottom: 20, color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}

          {step === 'scan' && (
            <>
              <QRScanner onScanned={handleScanned} onError={setError} />
              <p style={{ textAlign: 'center', marginTop: 16, color: '#475569', fontSize: 13 }}>
                Pas de caméra ?{' '}
                <span
                  style={{ color: '#3b82f6', cursor: 'pointer' }}
                  onClick={() => {
                    const link = prompt('Colle le lien de session :')
                    if (link) {
                      try {
                        const url = new URL(link)
                        const d = url.searchParams.get('d')
                        if (d) {
                          const { s, t } = JSON.parse(d)
                          handleScanned(s, t)
                        }
                      } catch {
                        setError('Lien invalide')
                      }
                    }
                  }}
                >
                  Saisir un lien
                </span>
              </p>
            </>
          )}

          {(step === 'enter-name' || step === 'joining') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 48 }}>🎿</span>
                <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>
                  Session trouvée ! Comment tu t'appelles ?
                </p>
              </div>

              <input
                type="text"
                placeholder="Ton prénom"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                autoFocus
                maxLength={20}
                disabled={step === 'joining'}
              />

              <button
                onClick={handleJoin}
                disabled={!name.trim() || step === 'joining'}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  border: 'none', borderRadius: 14,
                  padding: '16px 24px', color: '#fff',
                  fontSize: 16, fontWeight: 700,
                  cursor: !name.trim() || step === 'joining' ? 'not-allowed' : 'pointer',
                  minHeight: 56,
                  opacity: !name.trim() || step === 'joining' ? 0.5 : 1,
                }}
              >
                {step === 'joining' ? 'Connexion…' : 'Rejoindre la session'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  height: '100%', display: 'flex', flexDirection: 'column',
  background: '#0f172a',
}
