import { useEffect, useRef } from 'react'
import { gpsManager, type GPSPosition } from '@/lib/gps/backgroundGPS'
import { useSessionStore } from '@/stores/sessionStore'

export function useGeolocation() {
  const sessionId = useSessionStore((s) => s.session?.id)
  const userId = useSessionStore((s) => s.userId)
  const setMyPosition = useSessionStore((s) => s.setMyPosition)
  const started = useRef(false)

  useEffect(() => {
    if (!sessionId || !userId || started.current) return
    started.current = true

    gpsManager.start(sessionId, userId).catch(console.error)

    const unsub = gpsManager.onPosition((pos: GPSPosition) => {
      setMyPosition({ lat: pos.lat, lng: pos.lng, heading: pos.heading })
    })

    return () => {
      unsub()
      gpsManager.stop()
      started.current = false
    }
  }, [sessionId, userId, setMyPosition])
}
