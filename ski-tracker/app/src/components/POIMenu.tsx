/**
 * Floating menu for admin to place POIs on the map.
 * Shows after a long-press / map click.
 */
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/stores/sessionStore'
import type { POIType } from '@/types/database'

interface POIMenuProps {
  lat: number
  lng: number
  onClose: () => void
}

const POI_OPTIONS: Array<{ type: POIType; label: string; emoji: string; color: string }> = [
  { type: 'meetpoint', label: 'Rendez-vous', emoji: '📍', color: '#22c55e' },
  { type: 'danger',    label: 'Danger',       emoji: '⚠️', color: '#ef4444' },
  { type: 'info',      label: 'Information',  emoji: 'ℹ️', color: '#3b82f6' },
]

export function POIMenu({ lat, lng, onClose }: POIMenuProps) {
  const session = useSessionStore((s) => s.session)
  const userId = useSessionStore((s) => s.userId)
  const isAdmin = useSessionStore((s) => s.isAdmin)

  if (!isAdmin || !session || !userId) return null

  const handlePlace = async (type: POIType) => {
    const label = type === 'meetpoint'
      ? 'Point de rendez-vous'
      : type === 'danger'
      ? 'Zone dangereuse'
      : 'Information'

    await supabase.from('pois').insert({
      session_id: session.id,
      label,
      lat,
      lng,
      created_by: userId,
      type,
    })

    onClose()
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 200,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 200,
      }}
    >
      <span style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 4 }}>
        Poser un marqueur
      </span>
      {POI_OPTIONS.map((opt) => (
        <button
          key={opt.type}
          onClick={() => handlePlace(opt.type)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: `${opt.color}22`,
            border: `1px solid ${opt.color}`,
            borderRadius: 10,
            padding: '12px 16px',
            color: '#f8fafc',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: 56,
          }}
        >
          <span style={{ fontSize: 22 }}>{opt.emoji}</span>
          {opt.label}
        </button>
      ))}
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: '10px 16px',
          color: '#64748b',
          fontSize: 14,
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        Annuler
      </button>
    </div>
  )
}
