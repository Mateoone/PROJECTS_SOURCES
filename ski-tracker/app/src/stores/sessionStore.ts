import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, TeamMember, Position, POI } from '@/types/database'

interface MemberWithPosition extends TeamMember {
  position?: Position
}

interface SessionState {
  // Auth
  userId: string | null
  setUserId: (id: string) => void

  // Session
  session: Session | null
  isAdmin: boolean
  setSession: (session: Session, isAdmin: boolean) => void
  clearSession: () => void

  // Members
  members: MemberWithPosition[]
  setMembers: (members: TeamMember[]) => void
  updateMemberPosition: (userId: string, position: Position) => void

  // POIs
  pois: POI[]
  setPOIs: (pois: POI[]) => void
  addPOI: (poi: POI) => void
  removePOI: (poiId: string) => void

  // Active POI for navigation
  activePOI: POI | null
  setActivePOI: (poi: POI | null) => void

  // My own position
  myPosition: { lat: number; lng: number; heading: number | null } | null
  setMyPosition: (pos: { lat: number; lng: number; heading: number | null }) => void

  // Tile precache progress
  tileCacheProgress: number | null
  setTileCacheProgress: (p: number | null) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      setUserId: (id) => set({ userId: id }),

      session: null,
      isAdmin: false,
      setSession: (session, isAdmin) => set({ session, isAdmin }),
      clearSession: () =>
        set({ session: null, isAdmin: false, members: [], pois: [], activePOI: null }),

      members: [],
      setMembers: (members) =>
        set((s) => ({
          members: members.map((m) => ({
            ...m,
            position: s.members.find((em) => em.user_id === m.user_id)?.position,
          })),
        })),
      updateMemberPosition: (userId, position) =>
        set((s) => ({
          members: s.members.map((m) =>
            m.user_id === userId ? { ...m, position } : m
          ),
        })),

      pois: [],
      setPOIs: (pois) => set({ pois }),
      addPOI: (poi) => set((s) => ({ pois: [...s.pois.filter((p) => p.id !== poi.id), poi] })),
      removePOI: (poiId) =>
        set((s) => ({
          pois: s.pois.filter((p) => p.id !== poiId),
          activePOI: s.activePOI?.id === poiId ? null : s.activePOI,
        })),

      activePOI: null,
      setActivePOI: (poi) => set({ activePOI: poi }),

      myPosition: null,
      setMyPosition: (pos) => set({ myPosition: pos }),

      tileCacheProgress: null,
      setTileCacheProgress: (p) => set({ tileCacheProgress: p }),
    }),
    {
      name: 'ski-tracker-session',
      partialize: (s) => ({ userId: s.userId, session: s.session, isAdmin: s.isAdmin }),
    }
  )
)

/** Returns seconds since last position update for a member */
export function secondsSinceUpdate(member: MemberWithPosition): number | null {
  if (!member.position) return null
  return Math.round((Date.now() - new Date(member.position.timestamp).getTime()) / 1000)
}

/** Avatar color palette */
export const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

export function pickAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}
