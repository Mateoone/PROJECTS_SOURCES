import { useState, useEffect } from 'react'
import { gpsManager } from '@/lib/gps/backgroundGPS'
import { queuedCount } from '@/lib/gps/offlineQueue'
import { useBattery } from '@/hooks/useBattery'

export function GPSIndicator() {
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [queued, setQueued] = useState(0)
  const battery = useBattery()

  useEffect(() => {
    const unsub = gpsManager.onPosition((pos) => setAccuracy(pos.accuracy))
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const interval = setInterval(() => {
      queuedCount().then(setQueued)
    }, 5000)

    return () => {
      unsub()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [])

  const gpsColor =
    accuracy === null ? '#94a3b8'
    : accuracy < 10  ? '#22c55e'
    : accuracy < 30  ? '#eab308'
    : '#ef4444'

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'rgba(15,23,42,0.85)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 20,
      padding: '6px 12px',
    }}>
      {/* GPS dot */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: gpsColor,
        boxShadow: `0 0 6px ${gpsColor}`,
      }} />
      <span style={{ fontSize: 12, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
        {accuracy !== null ? `±${Math.round(accuracy)}m` : 'GPS…'}
      </span>

      {/* Offline badge */}
      {offline && (
        <span style={{
          background: '#dc2626', color: '#fff', fontSize: 10,
          fontWeight: 700, padding: '1px 5px', borderRadius: 4,
        }}>
          OFFLINE{queued > 0 ? ` (${queued})` : ''}
        </span>
      )}

      {/* Low battery */}
      {battery.isLow && (
        <span style={{ fontSize: 14 }} title="Batterie faible — GPS ralenti">🪫</span>
      )}
    </div>
  )
}
