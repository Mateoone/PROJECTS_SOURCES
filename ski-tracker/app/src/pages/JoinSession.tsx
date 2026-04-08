import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, ensureAnonymousUser } from '@/lib/supabase'
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
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke(
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
      setError(e instanceof Error ? e.message : 'Erreur lors de la connexion')
      setStep('enter-name')
    }
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
