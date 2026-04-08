/**
 * GPS manager with adaptive frequency based on movement and battery level.
 *
 * Strategy:
 * - Active (speed > 1 m/s): publish every ACTIVE_INTERVAL_MS
 * - Idle (speed ≤ 1 m/s): publish every IDLE_INTERVAL_MS
 * - Battery < 20%: halve both intervals' frequency
 */
import { supabase } from '@/lib/supabase'
import { queuePosition, flushPositions } from './offlineQueue'

const ACTIVE_INTERVAL_MS = 5_000
const IDLE_INTERVAL_MS = 30_000
const LOW_BATTERY_THRESHOLD = 0.20

export interface GPSPosition {
  lat: number
  lng: number
  altitude: number | null
  speed: number | null
  heading: number | null
  accuracy: number | null
  timestamp: number
}

export type GPSCallback = (pos: GPSPosition) => void

export class BackgroundGPS {
  private watchId: number | null = null
  private lastPublish = 0
  private lastPosition: GPSPosition | null = null
  private battery: BatteryManager | null = null
  private callbacks: Set<GPSCallback> = new Set()
  private sessionId: string | null = null
  private userId: string | null = null

  async start(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId

    // Try to get Battery API
    if ('getBattery' in navigator) {
      try {
        this.battery = await (navigator as Navigator & { getBattery: () => Promise<BatteryManager> }).getBattery()
      } catch {
        // Battery API not available — proceed without
      }
    }

    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported')
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => console.warn('[GPS] error:', err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    )

    // Flush offline queue when online
    window.addEventListener('online', this.onOnline)
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    window.removeEventListener('online', this.onOnline)
  }

  onPosition(cb: GPSCallback) {
    this.callbacks.add(cb)
    return () => this.callbacks.delete(cb)
  }

  private isLowBattery(): boolean {
    if (!this.battery) return false
    return !this.battery.charging && this.battery.level < LOW_BATTERY_THRESHOLD
  }

  private getInterval(speed: number | null): number {
    const isMoving = (speed ?? 0) > 1
    const base = isMoving ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS
    return this.isLowBattery() ? base * 2 : base
  }

  private handlePosition(rawPos: GeolocationPosition) {
    const pos: GPSPosition = {
      lat: rawPos.coords.latitude,
      lng: rawPos.coords.longitude,
      altitude: rawPos.coords.altitude,
      speed: rawPos.coords.speed,
      heading: rawPos.coords.heading,
      accuracy: rawPos.coords.accuracy,
      timestamp: rawPos.timestamp,
    }

    this.lastPosition = pos
    this.callbacks.forEach((cb) => cb(pos))

    const interval = this.getInterval(pos.speed)
    const now = Date.now()
    if (now - this.lastPublish < interval) return
    this.lastPublish = now

    this.publishPosition(pos)
  }

  private publishPosition(pos: GPSPosition) {
    if (!this.sessionId || !this.userId) return

    const record = {
      session_id: this.sessionId,
      user_id: this.userId,
      lat: pos.lat,
      lng: pos.lng,
      altitude: pos.altitude,
      speed: pos.speed,
      heading: pos.heading,
      accuracy: pos.accuracy,
      timestamp: new Date(pos.timestamp).toISOString(),
    }

    if (!navigator.onLine) {
      queuePosition(record)
      return
    }

    supabase
      .from('positions')
      .upsert(record, { onConflict: 'session_id,user_id' })
      .then(({ error }) => {
        if (error) {
          console.warn('[GPS] Supabase upsert failed, queuing:', error.message)
          queuePosition(record)
        }
      })
  }

  private onOnline = () => {
    flushPositions(async (positions) => {
      await supabase.from('positions').upsert(positions)
    })
  }

  getLastPosition(): GPSPosition | null {
    return this.lastPosition
  }
}

export const gpsManager = new BackgroundGPS()
