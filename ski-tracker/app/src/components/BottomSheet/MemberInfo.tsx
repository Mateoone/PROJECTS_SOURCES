import { useSessionStore, secondsSinceUpdate } from '@/stores/sessionStore'
import { haversineMeters } from '@/lib/routing/skimap'

export function MemberInfo() {
  const members = useSessionStore((s) => s.members)
  const pois = useSessionStore((s) => s.pois)
  const myPosition = useSessionStore((s) => s.myPosition)
  const setActivePOI = useSessionStore((s) => s.setActivePOI)
  const activePOI = useSessionStore((s) => s.activePOI)

  return (
    <div>
      <h3 style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
        Équipe ({members.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map((member) => {
          const age = secondsSinceUpdate(member)
          const dist = myPosition && member.position
            ? haversineMeters(myPosition.lat, myPosition.lng, member.position.lat, member.position.lng)
            : null

          return (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: member.avatar_color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0,
              }}>
                {member.display_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {member.display_name}
                </div>
                {age !== null && (
                  <div style={{ fontSize: 11, color: age > 60 ? '#ef4444' : '#64748b' }}>
                    il y a {age}s
                  </div>
                )}
              </div>
              {dist !== null && (
                <span style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0 }}>
                  {dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {pois.filter((p) => p.type === 'meetpoint').length > 0 && (
        <>
          <h3 style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 10px' }}>
            Points de rendez-vous
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pois.filter((p) => p.type === 'meetpoint').map((poi) => {
              const isActive = activePOI?.id === poi.id
              return (
                <button
                  key={poi.id}
                  onClick={() => setActivePOI(isActive ? null : poi)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isActive ? '#22c55e' : 'transparent'}`,
                    borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                    color: '#f8fafc', fontSize: 14, fontWeight: isActive ? 700 : 400,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 20 }}>📍</span>
                  {poi.label}
                  {isActive && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#22c55e' }}>ACTIF</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
