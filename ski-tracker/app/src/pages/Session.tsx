import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime'
import { useSessionStore } from '@/stores/sessionStore'
import { MapView } from '@/components/Map/MapView'
import { BottomSheet } from '@/components/BottomSheet/BottomSheet'
import { MemberInfo } from '@/components/BottomSheet/MemberInfo'
import { RouteInfo } from '@/components/BottomSheet/RouteInfo'
import { CompassOverlay } from '@/components/CompassOverlay'
import { GPSIndicator } from '@/components/GPSIndicator'
import { POIMenu } from '@/components/POIMenu'
import { QRGenerator } from '@/components/QRCode/QRGenerator'
import { buildSkiGraph } from '@/lib/routing/graph'
import { parseSkiMapGeoJSON } from '@/lib/routing/skimap'
import { findRoute } from '@/lib/routing/dijkstra'
import type { Route, SkiGraph } from '@/types/skimap'

export function Session() {
  const navigate = useNavigate()
  const session = useSessionStore((s) => s.session)
  const isAdmin = useSessionStore((s) => s.isAdmin)
  const activePOI = useSessionStore((s) => s.activePOI)
  const myPosition = useSessionStore((s) => s.myPosition)
  const tileCacheProgress = useSessionStore((s) => s.tileCacheProgress)

  const [poiMenuPos, setPOIMenuPos] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedPOI, setSelectedPOI] = useState<import('@/types/database').POI | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [skiGraph, setSkiGraph] = useState<SkiGraph | null>(null)
  const [bottomTab, setBottomTab] = useState<'team' | 'route'>('team')
  const [showInvite, setShowInvite] = useState(false)
  const graphLoadedRef = useRef(false)

  // Start GPS + realtime sync
  useGeolocation()
  useSupabaseRealtime()

  // Load ski graph for current station
  useEffect(() => {
    if (!session || graphLoadedRef.current) return
    graphLoadedRef.current = true

    // Try fetching OpenSkiMap GeoJSON for this station
    const url = `https://skimap.org/skimaps/${session.station_id}/v1.geojson`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<GeoJSON.FeatureCollection>
      })
      .then((geojson) => {
        const { runs, lifts } = parseSkiMapGeoJSON(geojson)
        const graph = buildSkiGraph(runs, lifts)
        setSkiGraph(graph)
      })
      .catch(() => {
        // No graph available for this station — routing disabled
      })
  }, [session])

  // Compute route when activePOI or position changes
  useEffect(() => {
    if (!activePOI || !myPosition || !skiGraph) {
      setRoute(null)
      return
    }
    const r = findRoute(skiGraph, myPosition.lat, myPosition.lng, activePOI.lat, activePOI.lng)
    setRoute(r)
    if (r) setBottomTab('route')
  }, [activePOI, myPosition, skiGraph])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isAdmin) setPOIMenuPos({ lat, lng })
    else setPOIMenuPos(null)
  }, [isAdmin])

  if (!session) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0f172a' }}>
      {/* Full-screen map */}
      <MapView onMapClick={handleMapClick} onPOIClick={setSelectedPOI} route={route} />

      {/* Top-left: GPS + status */}
      <GPSIndicator />

      {/* Top-center: station name */}
      <div style={{
        position: 'absolute', top: 'calc(16px + var(--safe-top))', left: '50%',
        transform: 'translateX(-50%)', zIndex: 20,
        background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '6px 14px',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
          ⛷️ {session.station_name}
        </span>
      </div>

      {/* Top-right: exit button */}
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute', top: 'calc(16px + var(--safe-top))', right: 16,
          zIndex: 20, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '6px 12px',
          color: '#94a3b8', fontSize: 13, cursor: 'pointer', minHeight: 44,
        }}
      >
        ✕
      </button>

      {/* Compass overlay (toward active meetpoint) */}
      <CompassOverlay />

      {/* Tile cache progress bar */}
      {tileCacheProgress !== null && (
        <div style={{
          position: 'absolute', top: 70, left: 16, right: 16, zIndex: 20,
          background: 'rgba(15,23,42,0.9)', borderRadius: 8, padding: '6px 10px',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
            Mise en cache des cartes… {tileCacheProgress}%
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${tileCacheProgress}%`, background: '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Admin: POI placement menu */}
      {poiMenuPos && (
        <POIMenu
          lat={poiMenuPos.lat}
          lng={poiMenuPos.lng}
          onClose={() => setPOIMenuPos(null)}
        />
      )}

      {/* Invite overlay */}
      {showInvite && session && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20, padding: 24, width: '100%', maxWidth: 360,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ color: '#f8fafc', fontSize: 17, fontWeight: 700 }}>Inviter des membres</h3>
              <button
                onClick={() => setShowInvite(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
              >✕</button>
            </div>
            <InviteQR sessionId={session.id} stationName={session.station_name} />
          </div>
        </div>
      )}

      {/* POI action sheet */}
      {selectedPOI && (
        <POIActionSheet
          poi={selectedPOI}
          onClose={() => setSelectedPOI(null)}
        />
      )}

      {/* Bottom sheet */}
      <BottomSheet>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <TabBtn active={bottomTab === 'team'} onClick={() => setBottomTab('team')}>
            Équipe
          </TabBtn>
          {route && (
            <TabBtn active={bottomTab === 'route'} onClick={() => setBottomTab('route')}>
              Itinéraire
            </TabBtn>
          )}
          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowInvite(true)}
                style={{
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 10, padding: '6px 12px',
                  color: '#818cf8', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', minHeight: 36,
                }}
              >
                + Inviter
              </button>
              <button
                onClick={() => {/* Let user tap map */}}
                style={{
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 10, padding: '6px 12px',
                  color: '#22c55e', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', minHeight: 36,
                }}
              >
                + Marqueur
              </button>
            </div>
          )}
        </div>

        {bottomTab === 'team' && <MemberInfo />}
        {bottomTab === 'route' && route && (
          <RouteInfo route={route} onClose={() => { setRoute(null); setBottomTab('team') }} />
        )}
      </BottomSheet>
    </div>
  )
}

import { supabase } from '@/lib/supabase'

function InviteQR({ sessionId, stationName }: { sessionId: string; stationName: string }) {
  const [token, setToken] = useState<string | null>(null)
  const userId = useSessionStore((s) => s.userId)

  useEffect(() => {
    if (!userId) return
    supabase.functions.invoke('create-session-token', {
      body: { session_id: sessionId, user_id: userId }
    }).then(({ data }) => {
      if (data?.token) setToken(data.token as string)
    })
  }, [sessionId, userId])

  if (!token) {
    return <p style={{ color: '#64748b', textAlign: 'center', fontSize: 14 }}>Chargement…</p>
  }

  return <QRGenerator token={token} sessionId={sessionId} stationName={stationName} />
}

const POI_ICONS: Record<string, string> = { meetpoint: '📍', danger: '⚠️', info: 'ℹ️' }
const POI_COLORS: Record<string, string> = { meetpoint: '#22c55e', danger: '#ef4444', info: '#3b82f6' }

function POIActionSheet({ poi, onClose }: { poi: import('@/types/database').POI; onClose: () => void }) {
  const isAdmin = useSessionStore((s) => s.isAdmin)
  const setActivePOI = useSessionStore((s) => s.setActivePOI)
  const activePOI = useSessionStore((s) => s.activePOI)
  const removePOI = useSessionStore((s) => s.removePOI)
  const addPOI = useSessionStore((s) => s.addPOI)
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(poi.label)
  const color = POI_COLORS[poi.type] ?? '#64748b'

  const handleDelete = async () => {
    removePOI(poi.id)
    onClose()
    await supabase.from('pois').update({ active: false }).eq('id', poi.id)
  }

  const handleSaveLabel = async () => {
    const trimmed = label.trim()
    if (trimmed && trimmed !== poi.label) {
      addPOI({ ...poi, label: trimmed })
      await supabase.from('pois').update({ label: trimmed }).eq('id', poi.id)
    }
    setEditing(false)
    onClose()
  }

  const handleActivate = () => {
    setActivePOI(activePOI?.id === poi.id ? null : poi)
    onClose()
  }

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 40,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 32px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 24 }}>{POI_ICONS[poi.type]}</span>
          {editing ? (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLabel(); if (e.key === 'Escape') { setEditing(false); setLabel(poi.label) } }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.08)', border: `1px solid ${color}`,
                borderRadius: 8, padding: '6px 10px', color: '#f8fafc', fontSize: 16,
                fontWeight: 700, outline: 'none',
              }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{poi.label}</span>
          )}
        </div>

        {/* Navigate */}
        <button
          onClick={handleActivate}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: activePOI?.id === poi.id ? `${color}33` : 'rgba(255,255,255,0.06)',
            border: `1px solid ${activePOI?.id === poi.id ? color : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12, padding: '13px 16px',
            color: activePOI?.id === poi.id ? color : '#f8fafc',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <span>🧭</span>
          {activePOI?.id === poi.id ? 'Désactiver la navigation' : 'Naviguer vers ce point'}
        </button>

        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 12, padding: '13px 16px',
              color: '#818cf8', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <span>✏️</span>Renommer
          </button>
        )}

        {isAdmin && editing && (
          <button
            onClick={handleSaveLabel}
            style={{
              background: `${color}22`, border: `1px solid ${color}`,
              borderRadius: 12, padding: '13px 16px',
              color, fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ✓ Enregistrer
          </button>
        )}

        {isAdmin && (
          <button
            onClick={handleDelete}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '13px 16px',
              color: '#ef4444', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <span>🗑️</span>Supprimer ce marqueur
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '11px 16px',
            color: '#64748b', fontSize: 14, cursor: 'pointer',
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
        border: `1px solid ${active ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10, padding: '6px 14px',
        color: active ? '#3b82f6' : '#64748b',
        fontSize: 13, fontWeight: active ? 700 : 400,
        cursor: 'pointer', minHeight: 36,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}
