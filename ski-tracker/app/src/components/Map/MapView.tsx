import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useSessionStore } from '@/stores/sessionStore'
import { difficultyColor } from '@/lib/routing/skimap'
import type { Route, SkiRun, SkiLift, RunDifficulty } from '@/types/skimap'
import type { POI } from '@/types/database'

export interface SkiFeatureInfo {
  type: 'run' | 'lift'
  name?: string
  difficulty?: RunDifficulty
  liftType?: string
}

interface MapViewProps {
  onMapClick?: (lat: number, lng: number) => void
  onPOIClick?: (poi: POI) => void
  onFeatureClick?: (info: SkiFeatureInfo) => void
  placementMode?: boolean
  runs?: SkiRun[]
  lifts?: SkiLift[]
  route?: Route | null
}

// Raster style: OSM base + OpenSnowMap ski overlay — works from any domain, no CORS issues
const RASTER_STYLE = {
  version: 8 as const,
  sources: {
    'osm-base': {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
    'snowmap': {
      type: 'raster' as const,
      tiles: ['https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenSnowMap',
      maxzoom: 18,
    },
  },
  layers: [
    { id: 'osm-base', type: 'raster' as const, source: 'osm-base', paint: { 'raster-opacity': 1 } },
    { id: 'snowmap-overlay', type: 'raster' as const, source: 'snowmap', paint: { 'raster-opacity': 0.9 } },
  ],
}

const DIFFICULTY_MAP: Record<string, RunDifficulty> = {
  novice: 'novice', easy: 'easy', intermediate: 'intermediate',
  advanced: 'advanced', expert: 'expert', freeride: 'freeride',
}

const LIFT_TYPE_FR: Record<string, string> = {
  chair_lift: 'Télésiège', drag_lift: 'Téléski', gondola: 'Télécabine',
  cable_car: 'Téléphérique', 't-bar': 'Tire-fesses', 'j-bar': 'Perche',
  platter: 'Téleski plateau', rope_tow: 'Câble', magic_carpet: 'Tapis roulant',
  mixed_lift: 'Remontée mixte',
}

export function MapView({ onMapClick, onPOIClick, onFeatureClick, placementMode = false, runs, lifts, route }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const poiMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const myMarkerRef = useRef<maplibregl.Marker | null>(null)

  const onMapClickRef = useRef(onMapClick)
  const onFeatureClickRef = useRef(onFeatureClick)
  const placementModeRef = useRef(placementMode)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onFeatureClickRef.current = onFeatureClick }, [onFeatureClick])
  useEffect(() => {
    placementModeRef.current = placementMode
    if (map.current) map.current.getCanvas().style.cursor = placementMode ? 'crosshair' : ''
  }, [placementMode])

  const session = useSessionStore((s) => s.session)
  const members = useSessionStore((s) => s.members)
  const pois = useSessionStore((s) => s.pois)
  const myPosition = useSessionStore((s) => s.myPosition)

  // ── Initialize map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current || !session) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: RASTER_STYLE,
      center: [session.station_center_lng, session.station_center_lat],
      zoom: 13,
      attributionControl: false,
      pitchWithRotate: false,
    })
    map.current = m

    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    m.on('click', (e) => {
      // Placement mode: always place POI, never show feature info
      if (placementModeRef.current) {
        onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng)
        return
      }

      // Check our loaded Overpass GeoJSON layers for run/lift click
      const geoLayers = ['ski-runs-hit', 'ski-lifts-hit'].filter((id) => m.getLayer(id))
      if (geoLayers.length > 0) {
        const features = m.queryRenderedFeatures(e.point, { layers: geoLayers })
        if (features.length > 0 && onFeatureClickRef.current) {
          const f = features[0]
          const p = f.properties ?? {}
          if (f.layer?.id === 'ski-lifts-hit') {
            const rawType = p['aerialway'] ?? ''
            const liftTypeFr = LIFT_TYPE_FR[rawType] ?? 'Remontée mécanique'
            onFeatureClickRef.current({ type: 'lift', name: p['name'] || undefined, liftType: liftTypeFr })
          } else {
            const diff = String(p['piste:difficulty'] ?? '').toLowerCase()
            onFeatureClickRef.current({
              type: 'run',
              name: p['name'] || undefined,
              difficulty: (DIFFICULTY_MAP[diff] as RunDifficulty) ?? 'unknown',
            })
          }
          return
        }
      }

      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng)
    })

    // Cursor feedback for Overpass layers
    m.on('mouseenter', 'ski-runs-hit', () => { if (!placementModeRef.current) m.getCanvas().style.cursor = 'pointer' })
    m.on('mouseleave', 'ski-runs-hit', () => { if (!placementModeRef.current) m.getCanvas().style.cursor = '' })
    m.on('mouseenter', 'ski-lifts-hit', () => { if (!placementModeRef.current) m.getCanvas().style.cursor = 'pointer' })
    m.on('mouseleave', 'ski-lifts-hit', () => { if (!placementModeRef.current) m.getCanvas().style.cursor = '' })

    return () => { m.remove(); map.current = null }
  }, [session])

  // ── Overpass GeoJSON click layers ───────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || (!runs?.length && !lifts?.length)) return

    const addLayers = () => {
      const geojson = buildSkiGeoJSON(runs ?? [], lifts ?? [])

      if (m.getSource('ski-data')) {
        ;(m.getSource('ski-data') as maplibregl.GeoJSONSource).setData(geojson)
        return
      }

      m.addSource('ski-data', { type: 'geojson', data: geojson })

      // Invisible wide hit areas
      m.addLayer({ id: 'ski-runs-hit', type: 'line', source: 'ski-data', filter: ['==', ['get', '_type'], 'run'],  paint: { 'line-width': 20, 'line-opacity': 0 } })
      m.addLayer({ id: 'ski-lifts-hit', type: 'line', source: 'ski-data', filter: ['==', ['get', '_type'], 'lift'], paint: { 'line-width': 20, 'line-opacity': 0 } })
    }

    if (m.isStyleLoaded()) addLayers()
    else m.once('load', addLayers)
  }, [runs, lifts])

  // ── Member markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m) return
    const currentIds = new Set(members.map((mb) => mb.user_id))
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) { marker.remove(); markersRef.current.delete(id) }
    }
    for (const member of members) {
      if (!member.position) continue
      const { lat, lng } = member.position
      if (markersRef.current.has(member.user_id)) {
        markersRef.current.get(member.user_id)!.setLngLat([lng, lat])
      } else {
        const el = createMemberEl(member.display_name, member.avatar_color)
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(m)
        markersRef.current.set(member.user_id, marker)
      }
    }
  }, [members])

  // ── My position marker ──────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || !myPosition) return
    if (!myMarkerRef.current) {
      myMarkerRef.current = new maplibregl.Marker({ element: createMyEl(), anchor: 'center' }).setLngLat([myPosition.lng, myPosition.lat]).addTo(m)
    } else {
      myMarkerRef.current.setLngLat([myPosition.lng, myPosition.lat])
    }
    if (myPosition.heading !== null) {
      const arrow = myMarkerRef.current.getElement().querySelector<HTMLElement>('.my-arrow')
      if (arrow) arrow.style.transform = `rotate(${myPosition.heading}deg)`
    }
  }, [myPosition])

  // ── POI markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m) return
    const currentPOIIds = new Set(pois.map((p) => p.id))
    for (const [id, marker] of poiMarkersRef.current) {
      if (!currentPOIIds.has(id)) { marker.remove(); poiMarkersRef.current.delete(id) }
    }
    for (const poi of pois) {
      if (poiMarkersRef.current.has(poi.id)) continue
      const el = createPOIEl(poi.type, poi.label)
      if (onPOIClick) {
        el.addEventListener('click', (e) => { e.stopPropagation(); onPOIClick(poi) })
        el.style.cursor = 'pointer'
      }
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([poi.lng, poi.lat]).addTo(m)
      poiMarkersRef.current.set(poi.id, marker)
    }
  }, [pois, onPOIClick])

  // ── Route layers ────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (m.getSource('route')) {
      if (m.getLayer('route-runs')) m.removeLayer('route-runs')
      if (m.getLayer('route-lifts')) m.removeLayer('route-lifts')
      m.removeSource('route')
    }
    if (!route) return
    m.addSource('route', { type: 'geojson', data: route.geometry })
    m.addLayer({ id: 'route-runs', type: 'line', source: 'route', filter: ['==', ['get', 'type'], 'run'], paint: { 'line-width': 5, 'line-color': ['match', ['get', 'difficulty'], 'novice', difficultyColor('novice'), 'easy', difficultyColor('easy'), 'intermediate', difficultyColor('intermediate'), 'advanced', difficultyColor('advanced'), 'expert', difficultyColor('expert'), difficultyColor('unknown')], 'line-opacity': 0.9 } })
    m.addLayer({ id: 'route-lifts', type: 'line', source: 'route', filter: ['==', ['get', 'type'], 'lift'], paint: { 'line-width': 5, 'line-color': '#f59e0b', 'line-dasharray': [2, 1], 'line-opacity': 0.9 } })
  }, [route])

  return <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSkiGeoJSON(runs: SkiRun[], lifts: SkiLift[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const run of runs) {
    const coords = run.geometry.type === 'LineString' ? [run.geometry.coordinates] : run.geometry.coordinates
    coords.forEach((c, i) => features.push({ type: 'Feature', id: `${run.id}_${i}`, geometry: { type: 'LineString', coordinates: c }, properties: { _type: 'run', name: run.name ?? null, 'piste:difficulty': run.difficulty } }))
  }
  for (const lift of lifts) {
    features.push({ type: 'Feature', id: lift.id, geometry: lift.geometry, properties: { _type: 'lift', name: lift.name ?? null, aerialway: lift.type } })
  }
  return { type: 'FeatureCollection', features }
}

function createMemberEl(name: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `width:40px;height:40px;border-radius:50%;background:${color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;user-select:none;`
  el.textContent = name.charAt(0).toUpperCase()
  return el
}

function createMyEl(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `width:48px;height:48px;position:relative;display:flex;align-items:center;justify-content:center;`
  const pulse = document.createElement('div')
  pulse.style.cssText = `position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(59,130,246,0.3);animation:pulse 2s infinite;`
  const dot = document.createElement('div')
  dot.style.cssText = `width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);position:relative;z-index:1;`
  const arrow = document.createElement('div')
  arrow.className = 'my-arrow'
  arrow.style.cssText = `position:absolute;top:0;left:50%;transform-origin:bottom center;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:14px solid #3b82f6;margin-left:-5px;`
  el.appendChild(pulse); el.appendChild(dot); el.appendChild(arrow)
  return el
}

const POI_ICONS: Record<string, string> = { meetpoint: '📍', danger: '⚠️', info: 'ℹ️' }
const POI_COLORS: Record<string, string> = { meetpoint: '#22c55e', danger: '#ef4444', info: '#3b82f6' }

function createPOIEl(type: string, label: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;`
  const bubble = document.createElement('div')
  bubble.style.cssText = `width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${POI_COLORS[type] ?? '#64748b'};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;`
  const icon = document.createElement('span')
  icon.style.cssText = 'transform:rotate(45deg);font-size:18px;'
  icon.textContent = POI_ICONS[type] ?? '📌'
  bubble.appendChild(icon)
  const labelEl = document.createElement('span')
  labelEl.style.cssText = `margin-top:2px;font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.6);padding:2px 4px;border-radius:3px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`
  labelEl.textContent = label
  el.appendChild(bubble); el.appendChild(labelEl)
  return el
}
