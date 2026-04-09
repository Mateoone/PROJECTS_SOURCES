import { useRef, useCallback, type ReactNode } from 'react'

interface BottomSheetProps {
  children: ReactNode
  minHeight?: number
  defaultHeight?: number
}

const SNAP_PEEK = 80

export function BottomSheet({ children, minHeight = SNAP_PEEK, defaultHeight = 280 }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)
  const currentH = useRef(defaultHeight)

  const snapTo = useCallback((h: number, animate = true) => {
    currentH.current = h
    if (sheetRef.current) {
      if (animate) {
        sheetRef.current.style.transition = 'height 0.3s cubic-bezier(0.32,0.72,0,1)'
        setTimeout(() => { if (sheetRef.current) sheetRef.current.style.transition = '' }, 320)
      }
      sheetRef.current.style.height = `${h}px`
    }
  }, [])

  const onDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    dragStartY.current = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragStartH.current = currentH.current

    const SNAP_FULL = Math.round(window.innerHeight * 0.75)
    const SNAP_HALF = defaultHeight
    const snaps = [minHeight, SNAP_HALF, SNAP_FULL]

    const onMove = (ev: TouchEvent | MouseEvent) => {
      const y = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY
      const delta = dragStartY.current - y
      const newH = Math.max(minHeight, Math.min(SNAP_FULL, dragStartH.current + delta))
      currentH.current = newH
      if (sheetRef.current) sheetRef.current.style.height = `${newH}px`
    }

    const onEnd = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('mouseup', onEnd)

      // Snap to closest point
      const closest = snaps.reduce((prev, curr) =>
        Math.abs(curr - currentH.current) < Math.abs(prev - currentH.current) ? curr : prev
      )
      snapTo(closest)
    }

    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('touchend', onEnd)
    document.addEventListener('mouseup', onEnd)
  }, [minHeight, defaultHeight, snapTo])

  return (
    <div
      ref={sheetRef}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: defaultHeight,
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px 20px 0 0',
        zIndex: 10,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Drag handle */}
      <div
        onTouchStart={onDragStart}
        onMouseDown={onDragStart}
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 0 8px',
          cursor: 'ns-resize',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
        }} />
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        {children}
      </div>
    </div>
  )
}
