import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ensureAnonymousUser, signInWithGoogle } from '@/lib/supabase'
import { useSessionStore, pickAvatarColor } from '@/stores/sessionStore'
import { precacheTiles } from '@/lib/tiles/tileCache'
import { QRGenerator } from '@/components/QRCode/QRGenerator'
import type { SkiStation } from '@/types/skimap'
import { TEST_STATIONS } from '@/lib/testStations'

type Step = 'pick-station' | 'show-qr'

export function AdminSession() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('pick-station')
  const [stations, setStations] = useState<SkiStation[]>(TEST_STATIONS)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SkiStation | null>(null)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setSession = useSessionStore((s) => s.setSession)
  const setUserId = useSessionStore((s) => s.setUserId)
  const setMembers = useSessionStore((s) => s.setMembers)
  const setTileCacheProgress = useSessionStore((s) => s.setTileCacheProgress)

  const session = useSessionStore((s) => s.session)
  const googleUser = useSessionStore((s) => s.googleUser)

  // Fetch station list from OpenSkiMap (with fallback to test data)
  useEffect(() => {
    fetch('https://skimap.org/skimaps/index.json')
      .then((r) => r.json())
      .then((data: Array<{ id: number; name: string; country: string; region?: string; lat: number; lng: number }>) => {
        const mapped: SkiStation[] = data.map((s) => ({
          id: String(s.id),
          name: s.name,
          country: s.country,
          region: s.region,
          center: [s.lng, s.lat],
        }))
        setStations(mapped)
      })
      .catch(() => {
        // Keep TEST_STATIONS as fallback
      })
  }, [])

  const filtered = stations.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.country.toLowerCase().includes(search.toLowerCase()) ||
      (s.region ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    setError(null)

    try {
      const userId = await ensureAnonymousUser()
      setUserId(userId)

      // Create session (expires in 12h)
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      const { data: sessionData, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          admin_id: userId,
          station_id: selected.id,
          station_name: selected.name,
          station_center_lat: selected.center[1],
          station_center_lng: selected.center[0],
          expires_at: expiresAt,
        })
        .select()
        .single()

      if (sessionErr) throw sessionErr

      // Add admin as first member
      const { error: memberErr } = await supabase.from('team_members').insert({
        session_id: sessionData.id,
        user_id: userId,
        display_name: 'Chef',
        avatar_color: pickAvatarColor(0),
      })
      if (memberErr) throw memberErr

      // Fetch join token from Edge Function
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        'create-session-token',
        { body: { session_id: sessionData.id, user_id: userId } }
      )
      if (fnErr) throw fnErr

      setSession(sessionData, true)
      setMembers([])
      setToken(fnData.token as string)

      // Pre-cache tiles in background
      precacheTiles(selected.center[1], selected.center[0], (fetched, total) => {
        setTileCacheProgress(Math.round((fetched / total) * 100))
        if (fetched === total) setTimeout(() => setTileCacheProgress(null), 2000)
      })

      setStep('show-qr')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [selected, setSession, setUserId, setMembers, setTileCacheProgress])

  if (step === 'show-qr' && session && token) {
    return (
      <div style={pageStyle}>
        <TopBar title="Session créée" onBack={() => navigate('/')} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px calc(24px + var(--safe-bottom))' }}>
          <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={infoCard}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 24 }}>🏔️</span>
                <div>
                  <p style={{ fontWeight: 700, color: '#f8fafc' }}>{session.station_name}</p>
                  <p style={{ fontSize: 12, color: '#64748b' }}>
                    Expire à {new Date(session.expires_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>

            <QRGenerator
              token={token}
              sessionId={session.id}
              stationName={session.station_name}
            />

            <button
              onClick={() => navigate(`/session/${session.id}`)}
              style={primaryBtn}
            >
              Aller sur la carte →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Require Google sign-in to create a session
  if (!googleUser) {
    return (
      <div style={pageStyle}>
        <TopBar title="Créer une session" onBack={() => navigate('/')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
          <span style={{ fontSize: 48 }}>🔑</span>
          <p style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', maxWidth: 280 }}>
            Connecte-toi avec Google pour créer une session
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
            <GoogleIcon />
            Continuer avec Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <TopBar title="Choisir une station" onBack={() => navigate('/')} />

      <div style={{ padding: '16px 16px 0' }}>
        <input
          type="search"
          placeholder="Rechercher une station…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px calc(16px + var(--safe-bottom))' }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 10, padding: '10px 14px', marginBottom: 12, color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}

        {filtered.slice(0, 80).map((station) => (
          <button
            key={station.id}
            onClick={() => setSelected(station)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              background: selected?.id === station.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selected?.id === station.id ? '#3b82f6' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
              marginBottom: 6, color: '#f8fafc', textAlign: 'left',
              transition: 'background 0.1s, border-color 0.1s',
            }}
          >
            <span style={{ fontSize: 22 }}>⛷️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {station.name}
              </p>
              <p style={{ fontSize: 12, color: '#475569' }}>
                {[station.region, station.country].filter(Boolean).join(', ')}
              </p>
            </div>
            {selected?.id === station.id && <span style={{ color: '#3b82f6', fontSize: 18 }}>✓</span>}
          </button>
        ))}

        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: '#475569', padding: 32 }}>
            Aucune station trouvée
          </p>
        )}
      </div>

      <div style={{ padding: '12px 16px calc(12px + var(--safe-bottom))', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleCreate}
          disabled={!selected || loading}
          style={{
            ...primaryBtn,
            opacity: !selected || loading ? 0.4 : 1,
          }}
        >
          {loading ? 'Création…' : selected ? `Créer la session · ${selected.name}` : 'Sélectionner une station'}
        </button>
      </div>
    </div>
  )
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: 'calc(16px + var(--safe-top)) 16px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
    }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 16, cursor: 'pointer', padding: '4px 0', minHeight: 44 }}>
        ← Retour
      </button>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>{title}</h2>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  height: '100%', display: 'flex', flexDirection: 'column',
  background: '#0f172a', overflowY: 'hidden',
}

const primaryBtn: React.CSSProperties = {
  width: '100%', background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  border: 'none', borderRadius: 14, padding: '16px 24px',
  color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 56,
}

const infoCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14, padding: '14px 16px',
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
