import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime'
import { useSessionStore } from '@/stores/sessionStore'
import { MapView } from '@/components/Map/MapView'
import type { SkiFeatureInfo } from '@/components/Map/MapView'
import { BottomSheet } from '@/components/BottomSheet/BottomSheet'
import { MemberInfo } from '@/components/BottomSheet/MemberInfo'
import { RouteInfo } from '@/components/BottomSheet/RouteInfo'
import { CompassOverlay } from '@/components/CompassOverlay'
import { GPSIndicator } from '@/components/GPSIndicator'
import { POIMenu } from '@/components/POIMenu'
import { QRGenerator } from '@/components/QRCode/QRGenerator'
import { supabase } from '@/lib/supabase'
import { buildSkiGraph } from '@/lib/routing/graph'
import { parseSkiMapGeoJSON, difficultyColor } from '@/lib/routing/skimap'
import { findRoute } from '@/lib/routing/dijkstra'
import type { Route, SkiGraph, SkiRun, SkiLift, RunDifficulty } from '@/types/skimap'
import type { POI } from '@/types/database'

// ─── Overpass fallback ──────────────────────────────────────────────────────

async function fetchSkiDataFromOverpass(lat: number, lng: number): Promise<GeoJSON.FeatureCollection> {
  const d = 0.09
  const bbox = `${lat - d},${lng - d},${lat + d},${lng + d}`
  const query = `[out:json][timeout:30];(way["piste:type"](${bbox});way["aerialway"](${bbox}););out geom;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error('Overpass failed')
  const data = await res.json()
  const features: GeoJSON.Feature[] = (data.elements ?? [])
    .filter((el: Record<string, unknown>) => el.type === 'way' && el.geometry)
    .map((way: Record<string, unknown>) => ({
      type: 'Feature' as const,
      id: way.id as number,
      geometry: {
        type: 'LineString' as const,
        coordinates: (way.geometry as Array<{ lat: number; lon: number }>).map((pt) => [pt.lon, pt.lat]),
      },
      properties: (way.tags as Record<string, unknown>) ?? {},
    }))
  return { type: 'FeatureCollection', features }
}

// ─── French labels ───────────────────────────────────────────────────────────

const DIFFICULTY_FR: Record<string, string> = {
  novice: 'Débutant',
  easy: 'Facile',
  intermediate: 'Intermédiaire',
  advanced: 'Difficile',
  expert: 'Expert',
  freeride: 'Freeride',
  unknown: 'Inconnue',
}

const LIFT_TYPE_FR: Record<string, string> = {
  chair_lift: 'Télésiège',
  drag_lift: 'Téléski',
  gondola: 'Télécabine',
  cable_car: 'Téléphérique',
  't-bar': 'Tire-fesses',
  'j-bar': 'Perche',
  platter: 'Téleski à plateau',
  rope_tow: 'Téléski à câble',
  magic_carpet: 'Tapis roulant',
  mixed_lift: 'Remontée mixte',
  unknown: 'Remontée mécanique',
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Session() {
  const navigate = useNavigate()
  const session = useSessionStore((s) => s.session)
  const isAdmin = useSessionStore((s) => s.isAdmin)
  const activePOI = useSessionStore((s) => s.activePOI)
  const myPosition = useSessionStore((s) => s.myPosition)
  const tileCacheProgress = useSessionStore((s) => s.tileCacheProgress)

  const [poiMenuPos, setPOIMenuPos] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [featureInfo, setFeatureInfo] = useState<SkiFeatureInfo | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [skiGraph, setSkiGraph] = useState<SkiGraph | null>(null)
  const [runs, setRuns] = useState<SkiRun[]>([])
  const [lifts, setLifts] = useState<SkiLift[]>([])
  const [placementMode, setPlacementMode] = useState(false)
  const [bottomTab, setBottomTab] = useState<'team' | 'route'>('team')
  const [showInvite, setShowInvite] = useState(false)
  const dataLoadedRef = useRef(false)

  useGeolocation()
  useSupabaseRealtime()

  // Load ski data (skimap.org → Overpass fallback)
  useEffect(() => {
    if (!session || dataLoadedRef.current) return
    dataLoadedRef.current = true

    const processGeoJSON = (geojson: GeoJSON.FeatureCollection) => {
      const { runs: r, lifts: l } = parseSkiMapGeoJSON(geojson)
      setRuns(r)
      setLifts(l)
      setSkiGraph(buildSkiGraph(r, l))
    }

    const url = `https://skimap.org/skimaps/${session.station_id}/v1.geojson`
    fetch(url)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() as Promise<GeoJSON.FeatureCollection> })
      .then(processGeoJSON)
      .catch(() => {
        fetchSkiDataFromOverpass(session.station_center_lat, session.station_center_lng)
          .then(processGeoJSON)
          .catch(() => { /* routing & feature click unavailable */ })
      })
  }, [session])

  // Compute route when activePOI changes
  useEffect(() => {
    if (!activePOI || !myPosition || !skiGraph) { setRoute(null); return }
    const r = findRoute(skiGraph, myPosition.lat, myPosition.lng, activePOI.lat, activePOI.lng)
    setRoute(r)
    if (r) setBottomTab('route')
  }, [activePOI, myPosition, skiGraph])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isAdmin && placementMode) {
      setPOIMenuPos({ lat, lng })
      setPlacementMode(false)
    }
  }, [isAdmin, placementMode])

  const handleFeatureClick = useCallback((info: SkiFeatureInfo) => {
    setFeatureInfo(info)
    setSelectedPOI(null)
  }, [])

  const handlePOIMenuClose = useCallback(() => {
    setPOIMenuPos(null)
  }, [])

  if (!session) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0f172a' }}>

      {/* Full-screen map */}
      <MapView
        onMapClick={handleMapClick}
        onPOIClick={setSelectedPOI}
        onFeatureClick={handleFeatureClick}
        placementMode={placementMode}
        runs={runs}
        lifts={lifts}
        route={route}
      />

      {/* Top-left: GPS */}
      <GPSIndicator />

      {/* Top-center: station name */}
      <div style={{
        position: 'absolute', top: 'calc(16px + var(--safe-top))', left: '50%',
        transform: 'translateX(-50%)', zIndex: 20,
        background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '6px 14px', pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>⛷️ {session.station_name}</span>
      </div>

      {/* Top-right: exit */}
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute', top: 'calc(16px + var(--safe-top))', right: 16, zIndex: 20,
          background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '6px 12px',
          color: '#94a3b8', fontSize: 13, cursor: 'pointer', minHeight: 44,
        }}
      >✕</button>

      {/* Placement mode banner */}
      {isAdmin && placementMode && (
        <div style={{
          position: 'absolute', top: 'calc(64px + var(--safe-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 25,
          background: 'rgba(34,197,94,0.15)', backdropFilter: 'blur(8px)',
          border: '1px solid #22c55e', borderRadius: 14, padding: '8px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Touchez la carte pour poser un marqueur</span>
          <button
            onClick={() => setPlacementMode(false)}
            style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: 16, cursor: 'pointer', padding: 0 }}
          >✕</button>
        </div>
      )}

      <CompassOverlay />

      {/* Tile cache progress */}
      {tileCacheProgress !== null && (
        <div style={{ position: 'absolute', top: 70, left: 16, right: 16, zIndex: 20, background: 'rgba(15,23,42,0.9)', borderRadius: 8, padding: '6px 10px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Mise en cache des cartes… {tileCacheProgress}%</div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${tileCacheProgress}%`, background: '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* POI placement menu */}
      {poiMenuPos && <POIMenu lat={poiMenuPos.lat} lng={poiMenuPos.lng} onClose={handlePOIMenuClose} />}

      {/* Ski feature info popup */}
      {featureInfo && (
        <SkiFeatureSheet info={featureInfo} onClose={() => setFeatureInfo(null)} />
      )}

      {/* Invite overlay */}
      {showInvite && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ color: '#f8fafc', fontSize: 17, fontWeight: 700 }}>Inviter des membres</h3>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <InviteQR sessionId={session.id} stationName={session.station_name} />
          </div>
        </div>
      )}

      {/* POI action sheet */}
      {selectedPOI && <POIActionSheet poi={selectedPOI} onClose={() => setSelectedPOI(null)} />}

      {/* Bottom sheet */}
      <BottomSheet>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <TabBtn active={bottomTab === 'team'} onClick={() => setBottomTab('team')}>Équipe</TabBtn>
          {route && <TabBtn active={bottomTab === 'route'} onClick={() => setBottomTab('route')}>Itinéraire</TabBtn>}
          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowInvite(true)}
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '6px 12px', color: '#818cf8', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 36 }}
              >+ Inviter</button>
              <button
                onClick={() => setPlacementMode((v) => !v)}
                style={{
                  background: placementMode ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.12)',
                  border: `1px solid ${placementMode ? '#22c55e' : 'rgba(34,197,94,0.3)'}`,
                  borderRadius: 10, padding: '6px 12px',
                  color: '#22c55e', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 36,
                  transition: 'all 0.15s',
                }}
              >{placementMode ? '✕ Annuler' : '+ Marqueur'}</button>
            </div>
          )}
        </div>
        {bottomTab === 'team' && <MemberInfo />}
        {bottomTab === 'route' && route && <RouteInfo route={route} onClose={() => { setRoute(null); setBottomTab('team') }} />}
      </BottomSheet>
    </div>
  )
}

// ─── Ski feature info sheet ──────────────────────────────────────────────────

function SkiFeatureSheet({ info, onClose }: { info: SkiFeatureInfo; onClose: () => void }) {
  const isRun = info.type === 'run'
  const color = isRun ? difficultyColor((info.difficulty as RunDifficulty) ?? 'unknown') : '#f59e0b'

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 40, borderRadius: 3, background: color, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
              {info.name ?? (isRun ? 'Piste sans nom' : 'Remontée sans nom')}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              {isRun
                ? `${isRun ? '⛷️' : '🚡'} ${DIFFICULTY_FR[info.difficulty ?? 'unknown'] ?? 'Inconnue'}`
                : `🚡 ${LIFT_TYPE_FR[info.liftType ?? 'unknown'] ?? 'Remontée mécanique'}`
              }
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '11px 16px', color: '#64748b', fontSize: 14, cursor: 'pointer' }}
        >Fermer</button>
      </div>
    </div>
  )
}

// ─── Invite QR ───────────────────────────────────────────────────────────────

function InviteQR({ sessionId, stationName }: { sessionId: string; stationName: string }) {
  const [token, setToken] = useState<string | null>(null)
  const userId = useSessionStore((s) => s.userId)
  useEffect(() => {
    if (!userId) return
    supabase.functions.invoke('create-session-token', { body: { session_id: sessionId, user_id: userId } })
      .then(({ data }) => { if (data?.token) setToken(data.token as string) })
  }, [sessionId, userId])
  if (!token) return <p style={{ color: '#64748b', textAlign: 'center', fontSize: 14 }}>Chargement…</p>
  return <QRGenerator token={token} sessionId={sessionId} stationName={stationName} />
}

// ─── POI action sheet ─────────────────────────────────────────────────────────

const POI_ICONS: Record<string, string> = { meetpoint: '📍', danger: '⚠️', info: 'ℹ️' }
const POI_COLORS: Record<string, string> = { meetpoint: '#22c55e', danger: '#ef4444', info: '#3b82f6' }

function POIActionSheet({ poi, onClose }: { poi: POI; onClose: () => void }) {
  const isAdmin = useSessionStore((s) => s.isAdmin)
  const setActivePOI = useSessionStore((s) => s.setActivePOI)
  const activePOI = useSessionStore((s) => s.activePOI)
  const removePOI = useSessionStore((s) => s.removePOI)
  const addPOI = useSessionStore((s) => s.addPOI)
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(poi.label)
  const color = POI_COLORS[poi.type] ?? '#64748b'

  const handleDelete = async () => { removePOI(poi.id); onClose(); await supabase.from('pois').update({ active: false }).eq('id', poi.id) }
  const handleSaveLabel = async () => {
    const trimmed = label.trim()
    if (trimmed && trimmed !== poi.label) { addPOI({ ...poi, label: trimmed }); await supabase.from('pois').update({ label: trimmed }).eq('id', poi.id) }
    setEditing(false); onClose()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 24 }}>{POI_ICONS[poi.type]}</span>
          {editing
            ? <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLabel(); if (e.key === 'Escape') { setEditing(false); setLabel(poi.label) } }} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: `1px solid ${color}`, borderRadius: 8, padding: '6px 10px', color: '#f8fafc', fontSize: 16, fontWeight: 700, outline: 'none' }} />
            : <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{poi.label}</span>
          }
        </div>
        <button onClick={() => { setActivePOI(activePOI?.id === poi.id ? null : poi); onClose() }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: activePOI?.id === poi.id ? `${color}33` : 'rgba(255,255,255,0.06)', border: `1px solid ${activePOI?.id === poi.id ? color : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '13px 16px', color: activePOI?.id === poi.id ? color : '#f8fafc', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          <span>🧭</span>{activePOI?.id === poi.id ? 'Désactiver la navigation' : 'Naviguer vers ce point'}
        </button>
        {isAdmin && !editing && <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: '13px 16px', color: '#818cf8', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}><span>✏️</span>Renommer</button>}
        {isAdmin && editing && <button onClick={handleSaveLabel} style={{ background: `${color}22`, border: `1px solid ${color}`, borderRadius: 12, padding: '13px 16px', color, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>✓ Enregistrer</button>}
        {isAdmin && <button onClick={handleDelete} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '13px 16px', color: '#ef4444', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}><span>🗑️</span>Supprimer ce marqueur</button>}
        <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '11px 16px', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>Annuler</button>
      </div>
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: active ? 'rgba(59,130,246,0.2)' : 'transparent', border: `1px solid ${active ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '6px 14px', color: active ? '#3b82f6' : '#64748b', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer', minHeight: 36, transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}
