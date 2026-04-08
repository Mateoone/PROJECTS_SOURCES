import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { signInWithGoogle, signOutUser } from '@/lib/supabase'
import { useState } from 'react'

export function Home() {
  const navigate = useNavigate()
  const session = useSessionStore((s) => s.session)
  const googleUser = useSessionStore((s) => s.googleUser)
  const setGoogleUser = useSessionStore((s) => s.setGoogleUser)
  const [authLoading, setAuthLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setAuthLoading(true)
    try {
      await signInWithGoogle()
      // Page redirects to Google, so loading state is fine
    } catch {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOutUser()
    setGoogleUser(null)
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 24px calc(24px + var(--safe-bottom))',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>⛷️</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
          Ski Team Tracker
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>
          Restez groupés sur le domaine
        </p>
      </div>

      {/* Google user info or sign-in */}
      <div style={{ width: '100%', maxWidth: 360, marginBottom: 24 }}>
        {googleUser ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: '12px 16px',
          }}>
            {googleUser.avatarUrl ? (
              <img
                src={googleUser.avatarUrl}
                alt={googleUser.name ?? ''}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }}
              />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#3b82f6', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16,
              }}>
                {(googleUser.name ?? googleUser.email ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#f8fafc', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {googleUser.name ?? googleUser.email}
              </p>
              {googleUser.name && googleUser.email && (
                <p style={{ color: '#64748b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {googleUser.email}
                </p>
              )}
            </div>
            <button
              onClick={handleSignOut}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              Déconnexion
            </button>
          </div>
        ) : (
          <button
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: '#fff', border: 'none', borderRadius: 14,
              padding: '14px 24px', color: '#1f2937',
              fontSize: 15, fontWeight: 600,
              cursor: authLoading ? 'not-allowed' : 'pointer',
              opacity: authLoading ? 0.7 : 1,
              minHeight: 52,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <GoogleIcon />
            {authLoading ? 'Connexion…' : 'Continuer avec Google'}
          </button>
        )}
      </div>

      {/* Resume existing session */}
      {session && (
        <div style={{
          width: '100%', maxWidth: 360,
          background: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 16, padding: 16, marginBottom: 24,
        }}>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>SESSION EN COURS</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 700, color: '#f8fafc' }}>{session.station_name}</p>
              <p style={{ fontSize: 12, color: '#64748b' }}>
                Expire {new Date(session.expires_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button
              onClick={() => navigate(`/session/${session.id}`)}
              style={{
                background: '#3b82f6', border: 'none', borderRadius: 10,
                padding: '10px 18px', color: '#fff', fontSize: 14,
                fontWeight: 600, cursor: 'pointer', minHeight: 44,
              }}
            >
              Reprendre
            </button>
          </div>
        </div>
      )}

      {/* Main CTAs */}
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={() => navigate('/create')}
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            border: 'none', borderRadius: 16,
            padding: '18px 24px', color: '#fff',
            fontSize: 17, fontWeight: 700,
            cursor: 'pointer', minHeight: 64,
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
          }}
        >
          <span style={{ fontSize: 28 }}>🏔️</span>
          <div style={{ textAlign: 'left' }}>
            <div>Créer une session</div>
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>Chef d'équipe</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/join')}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: '18px 24px', color: '#f8fafc',
            fontSize: 17, fontWeight: 700,
            cursor: 'pointer', minHeight: 64,
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <span style={{ fontSize: 28 }}>📱</span>
          <div style={{ textAlign: 'left' }}>
            <div>Rejoindre</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>Scanner le QR code</div>
          </div>
        </button>
      </div>

      <p style={{ marginTop: 40, color: '#334155', fontSize: 12, textAlign: 'center' }}>
        Fonctionne hors-ligne · GPS temps réel
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
