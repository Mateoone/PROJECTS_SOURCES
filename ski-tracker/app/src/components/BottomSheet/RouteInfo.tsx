import type { Route } from '@/types/skimap'
import { difficultyColor } from '@/lib/routing/skimap'

interface RouteInfoProps {
  route: Route
  onClose: () => void
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}min ${s}s` : `${m}min`
}

const LIFT_EMOJI: Record<string, string> = {
  chair_lift: '🚡',
  gondola: '🚠',
  cable_car: '🚟',
  drag_lift: '🎿',
  't-bar': '🎿',
  j_bar: '🎿',
  platter: '🎿',
  rope_tow: '🪢',
  magic_carpet: '🎪',
  mixed_lift: '🚡',
  unknown: '🚡',
}

export function RouteInfo({ route, onClose }: RouteInfoProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700 }}>
          Itinéraire · {formatTime(route.totalSeconds)}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: 8,
            padding: '4px 10px',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ✕ Fermer
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {route.steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 10,
              padding: '10px 12px',
              borderLeft: `3px solid ${step.type === 'lift' ? '#f59e0b' : (step.difficultyColor ?? '#64748b')}`,
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0 }}>
              {step.type === 'lift'
                ? LIFT_EMOJI[step.liftType ?? 'unknown']
                : '🎿'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {step.name ?? (step.type === 'lift' ? 'Remontée mécanique' : 'Piste')}
              </div>
              {step.difficulty && (
                <div style={{
                  display: 'inline-block',
                  marginTop: 2,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: difficultyColor(step.difficulty),
                  fontSize: 10,
                  fontWeight: 700,
                  color: step.difficulty === 'advanced' || step.difficulty === 'expert' ? '#fff' : '#000',
                }}>
                  {step.difficulty.toUpperCase()}
                </div>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>
              {formatTime(step.estimatedSeconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
