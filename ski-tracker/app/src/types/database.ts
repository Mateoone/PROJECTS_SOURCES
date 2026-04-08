// Auto-generated from Supabase schema — do not edit manually
// Run: npx supabase gen types typescript --local > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          admin_id: string
          station_id: string
          station_name: string
          station_center_lat: number
          station_center_lng: number
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          station_id: string
          station_name: string
          station_center_lat: number
          station_center_lng: number
          created_at?: string
          expires_at: string
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
      }
      team_members: {
        Row: {
          id: string
          session_id: string
          user_id: string
          display_name: string
          avatar_color: string
          joined_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          display_name: string
          avatar_color?: string
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
      }
      positions: {
        Row: {
          id: string
          session_id: string
          user_id: string
          lat: number
          lng: number
          altitude: number | null
          speed: number | null
          heading: number | null
          accuracy: number | null
          timestamp: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          lat: number
          lng: number
          altitude?: number | null
          speed?: number | null
          heading?: number | null
          accuracy?: number | null
          timestamp?: string
        }
        Update: Partial<Database['public']['Tables']['positions']['Insert']>
      }
      pois: {
        Row: {
          id: string
          session_id: string
          label: string
          lat: number
          lng: number
          created_by: string
          type: 'meetpoint' | 'danger' | 'info'
          created_at: string
          active: boolean
        }
        Insert: {
          id?: string
          session_id: string
          label: string
          lat: number
          lng: number
          created_by: string
          type: 'meetpoint' | 'danger' | 'info'
          created_at?: string
          active?: boolean
        }
        Update: Partial<Database['public']['Tables']['pois']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: {
      create_session_token: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      poi_type: 'meetpoint' | 'danger' | 'info'
    }
  }
}

// Convenience row types
export type Session = Database['public']['Tables']['sessions']['Row']
export type TeamMember = Database['public']['Tables']['team_members']['Row']
export type Position = Database['public']['Tables']['positions']['Row']
export type POI = Database['public']['Tables']['pois']['Row']
export type POIType = Database['public']['Enums']['poi_type']
