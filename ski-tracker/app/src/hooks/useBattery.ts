import { useEffect, useState } from 'react'

export interface BatteryState {
  level: number        // 0–1
  charging: boolean
  isLow: boolean       // < 20% and not charging
}

export function useBattery(): BatteryState {
  const [state, setState] = useState<BatteryState>({
    level: 1,
    charging: true,
    isLow: false,
  })

  useEffect(() => {
    if (!('getBattery' in navigator)) return

    let battery: BatteryManager

    const update = (b: BatteryManager) => {
      setState({
        level: b.level,
        charging: b.charging,
        isLow: !b.charging && b.level < 0.2,
      })
    }

    const nav = navigator as Navigator & { getBattery: () => Promise<BatteryManager> }
    nav.getBattery().then((b) => {
      battery = b
      update(b)
      b.addEventListener('levelchange', () => update(b))
      b.addEventListener('chargingchange', () => update(b))
    })

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', () => update(battery))
        battery.removeEventListener('chargingchange', () => update(battery))
      }
    }
  }, [])

  return state
}
