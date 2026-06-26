/**
 * Compass arrow pointing toward the active POI meetpoint.
 * Shows distance and estimated bearing from current position.
 */
import { useSessionStore } from '@/stores/sessionStore'
import { haversineMeters } from '@/lib/routing/skimap'

function bearingDeg(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): number {
  const dLng = ((toLng - fromLng) * Math.PI) / 180
  const lat1 = (fromLat * Math.PI) / 180
  const lat2 = (toLat * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

export function CompassOverlay() {
  const activePOI = useSessionStore((s) => s.activePOI)
  const myPosition = useSessionStore((s) => s.myPosition)

  if (!activePOI || !myPosition) return null

  const dist = haversineMeters(myPosition.lat, myPosition.lng, activePOI.lat, activePOI.lng)
  const bearing = bearingDeg(myPosition.lat, myPosition.lng, activePOI.lat, activePOI.lng)

  const headingOffset = myPosition.heading ?? 0
  const arrowRotation = bearing - headingOffset

  return (
    <div style={{
      position: 'absolute',
      top: 80,
      right: 16,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(15,23,42,0.85)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 16,
      padding: '12px 14px',
      minWidth: 72,
    }}>
      <div style={{
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg
          width={40}
          height={40}
          viewBox="0 0 40 40"
          style={{ transform: `rotate(${arrowRotation}deg)`, transition: 'transform 0.5s ease' }}
        >
          <polygon
            points="20,2 26,28 20,24 14,28"
            fill="#22c55e"
            stroke="#fff"
            strokeWidth={1.5}
          />
          <polygon
            points="20,38 26,12 20,16 14,12"
            fill="#94a3b8"
            strokeWidth={0}
          />
        </svg>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
        {formatDistance(dist)}
      </span>
      <span style={{ fontSize: 10, color: '#94a3b8', maxWidth: 64, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {activePOI.label}
      </span>
    </div>
  )
}
