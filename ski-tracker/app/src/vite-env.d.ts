/// <reference types="vite/client" />

interface BatteryManager extends EventTarget {
  charging: boolean
  chargingTime: number
  dischargingTime: number
  level: number
  addEventListener(type: 'chargingchange' | 'levelchange', listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: 'chargingchange' | 'levelchange', listener: EventListenerOrEventListenerObject): void
}
