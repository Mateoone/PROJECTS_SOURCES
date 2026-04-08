import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'

export function Home() {
  const navigate = useNavigate()
  const session = useSessionStore((s) => s.session)

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
