/**
 * Subscribes to Realtime updates for positions and POIs within the current session.
 */
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/stores/sessionStore'
import type { Position, POI } from '@/types/database'

export function useSupabaseRealtime() {
  const sessionId = useSessionStore((s) => s.session?.id)
  const updateMemberPosition = useSessionStore((s) => s.updateMemberPosition)
  const addPOI = useSessionStore((s) => s.addPOI)
  const removePOI = useSessionStore((s) => s.removePOI)
  const activePOI = useSessionStore((s) => s.activePOI)

  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on<Position>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            updateMemberPosition(payload.new.user_id, payload.new)
          }
        }
      )
      .on<POI>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pois',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          addPOI(payload.new)

          // Push notification for danger POIs
          if (
            payload.new.type === 'danger' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification('⚠️ Zone dangereuse signalée', {
              body: payload.new.label,
              icon: '/icons/icon-192.png',
              tag: `poi-danger-${payload.new.id}`,
            })
          }
        }
      )
      .on<POI>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pois',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (!payload.new.active) {
            removePOI(payload.new.id)
          } else {
            addPOI(payload.new)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, updateMemberPosition, addPOI, removePOI, activePOI])
}
