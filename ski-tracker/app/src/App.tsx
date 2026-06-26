import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useSessionBootstrap } from '@/hooks/useSession'
import { Home } from '@/pages/Home'
import { AdminSession } from '@/pages/AdminSession'
import { JoinSession } from '@/pages/JoinSession'
import { Session } from '@/pages/Session'
import { useSessionStore } from '@/stores/sessionStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useSessionStore((s) => s.session)
  if (!session) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  useSessionBootstrap()

  const setGoogleUser = useSessionStore((s) => s.setGoogleUser)

  useEffect(() => {
    // Sync Google OAuth user from Supabase auth state
    const syncUser = (authUser: import('@supabase/supabase-js').User | null) => {
      if (!authUser || authUser.app_metadata?.provider === 'anonymous') {
        setGoogleUser(null)
        return
      }
      setGoogleUser({
        id: authUser.id,
        email: authUser.email ?? null,
        name: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null,
        avatarUrl: authUser.user_metadata?.avatar_url ?? null,
      })
    }

    supabase.auth.getSession().then(({ data: { session } }) => syncUser(session?.user ?? null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [setGoogleUser])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create" element={<AdminSession />} />
      <Route path="/join" element={<JoinSession />} />
      <Route path="/session/:id" element={
        <AuthGuard>
          <Session />
        </AuthGuard>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#0f172a', textAlign: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 48 }}>⚙️</span>
        <h2 style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700 }}>Configuration requise</h2>
        <p style={{ color: '#64748b', fontSize: 14, maxWidth: 320 }}>
          Créer un fichier <code style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>app/.env.local</code> avec tes credentials Supabase :
        </p>
        <pre style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#94a3b8',
          textAlign: 'left', width: '100%', maxWidth: 360,
        }}>
{`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p style={{ color: '#475569', fontSize: 12 }}>
          Puis relancer <code style={{ color: '#64748b' }}>npm run dev</code>
        </p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
