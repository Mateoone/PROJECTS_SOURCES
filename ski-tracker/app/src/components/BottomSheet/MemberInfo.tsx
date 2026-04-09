import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSessionStore, secondsSinceUpdate } from '@/stores/sessionStore'
import { haversineMeters } from '@/lib/routing/skimap'
import type { POI } from '@/types/database'

interface POIRowProps {
  poi: POI
  isActive: boolean
  isAdmin: boolean
  onActivate: () => void
  onDelete: () => void
  onEdit: (newLabel: string) => void
}

function POIRow({ poi, isActive, isAdmin, onActivate, onDelete, onEdit }: POIRowProps) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(poi.label)

  const POI_COLORS: Record<string, string> = {
    meetpoint: '#22c55e',
    danger: '#ef4444',
    info: '#3b82f6',
  }
  const POI_ICONS: Record<string, string> = {
    meetpoint: '📍',
    danger: '⚠️',
    info: 'ℹ️',
  }

  const handleSave = () => {
    if (label.trim() && label.trim() !== poi.label) {
      onEdit(label.trim())
    }
    setEditing(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: isActive
          ? `${POI_COLORS[poi.type]}22`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isActive ? POI_COLORS[poi.type] : 'transparent'}`,
        borderRadius: 12,
        padding: '8px 10px',
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{POI_ICONS[poi.type] ?? '📌'}</span>

      {editing ? (
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6, padding: '4px 8px', color: '#f8fafc', fontSize: 13,
            outline: 'none',
          }}
        />
      ) : (
        <span
          style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 700 : 500, color: '#f8fafc', cursor: 'pointer' }}
          onClick={onActivate}
        >
          {poi.label}
          {isActive && <span style={{ marginLeft: 6, fontSize: 10, color: POI_COLORS[poi.type] }}>ACTIF</span>}
        </span>
      )}

      {isAdmin && !editing && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setLabel(poi.label); setEditing(true) }}
            style={{
              background: 'rgba(99,102,241,0.15)', border: 'none', borderRadius: 6,
              padding: '4px 8px', color: '#818cf8', fontSize: 11, cursor: 'pointer',
            }}
          >✏️</button>
          <button
            onClick={onDelete}
            style={{
              background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 6,
              padding: '4px 8px', color: '#ef4444', fontSize: 11, cursor: 'pointer',
            }}
          >🗑️</button>
        </div>
      )}
    </div>
  )
}

export function MemberInfo() {
  const members = useSessionStore((s) => s.members)
  const pois = useSessionStore((s) => s.pois)
  const myPosition = useSessionStore((s) => s.myPosition)
  const setActivePOI = useSessionStore((s) => s.setActivePOI)
  const activePOI = useSessionStore((s) => s.activePOI)
  const removePOI = useSessionStore((s) => s.removePOI)
  const addPOI = useSessionStore((s) => s.addPOI)
  const userId = useSessionStore((s) => s.userId)
  const isAdmin = useSessionStore((s) => s.isAdmin)
  const updateMemberName = useSessionStore((s) => s.updateMemberName)

  const [editingName, setEditingName] = useState(false)
  const myMember = members.find((m) => m.user_id === userId)
  const [nameInput, setNameInput] = useState(myMember?.display_name ?? '')

  const handleSaveName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || !userId || !myMember || trimmed === myMember.display_name) {
      setEditingName(false)
      return
    }
    updateMemberName(userId, trimmed)
    setEditingName(false)
    await supabase
      .from('team_members')
      .update({ display_name: trimmed })
      .eq('user_id', userId)
      .eq('session_id', myMember.session_id)
  }

  const handleDeletePOI = async (poi: POI) => {
    removePOI(poi.id)
    await supabase.from('pois').update({ active: false }).eq('id', poi.id)
  }

  const handleEditPOI = async (poi: POI, newLabel: string) => {
    addPOI({ ...poi, label: newLabel })
    await supabase.from('pois').update({ label: newLabel }).eq('id', poi.id)
  }

  // Group POIs by type
  const meetpoints = pois.filter((p) => p.type === 'meetpoint')
  const dangers = pois.filter((p) => p.type === 'danger')
  const infos = pois.filter((p) => p.type === 'info')

  return (
    <div>
      {/* Team list */}
      <h3 style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
        Équipe ({members.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map((member) => {
          const age = secondsSinceUpdate(member)
          const dist = myPosition && member.position
            ? haversineMeters(myPosition.lat, myPosition.lng, member.position.lat, member.position.lng)
            : null
          const isMe = member.user_id === userId

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
                {isMe && editingName ? (
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 6, padding: '3px 8px', color: '#f8fafc', fontSize: 14,
                      outline: 'none', width: '100%',
                    }}
                  />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.display_name}
                    {isMe && <span style={{ marginLeft: 4, fontSize: 10, color: '#64748b' }}>(moi)</span>}
                  </div>
                )}
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

              {isMe && !editingName && (
                <button
                  onClick={() => { setNameInput(member.display_name); setEditingName(true) }}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6,
                    padding: '4px 8px', color: '#64748b', fontSize: 13, cursor: 'pointer',
                  }}
                >✏️</button>
              )}
            </div>
          )
        })}
      </div>

      {/* POI sections */}
      {[
        { label: 'Points de rendez-vous', items: meetpoints, color: '#22c55e' },
        { label: 'Zones dangereuses', items: dangers, color: '#ef4444' },
        { label: 'Informations', items: infos, color: '#3b82f6' },
      ].map(({ label, items, color }) =>
        items.length > 0 ? (
          <div key={label}>
            <h3 style={{ color, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>
              {label} ({items.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((poi) => (
                <POIRow
                  key={poi.id}
                  poi={poi}
                  isActive={activePOI?.id === poi.id}
                  isAdmin={isAdmin}
                  onActivate={() => setActivePOI(activePOI?.id === poi.id ? null : poi)}
                  onDelete={() => handleDeletePOI(poi)}
                  onEdit={(newLabel) => handleEditPOI(poi, newLabel)}
                />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  )
}
