// Generated from live Supabase schema — cpbaomccpneahpjxgyae
// supabase gen types typescript --project-id cpbaomccpneahpjxgyae

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      pois: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          label: string
          lat: number
          lng: number
          session_id: string
          type: Database["public"]["Enums"]["poi_type"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          label: string
          lat: number
          lng: number
          session_id: string
          type?: Database["public"]["Enums"]["poi_type"]
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          label?: string
          lat?: number
          lng?: number
          session_id?: string
          type?: Database["public"]["Enums"]["poi_type"]
        }
        Relationships: [
          {
            foreignKeyName: "pois_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          accuracy: number | null
          altitude: number | null
          heading: number | null
          id: string
          lat: number
          lng: number
          session_id: string
          speed: number | null
          timestamp: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          heading?: number | null
          id?: string
          lat: number
          lng: number
          session_id: string
          speed?: number | null
          timestamp?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          session_id?: string
          speed?: number | null
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          admin_id: string
          created_at: string
          expires_at: string
          id: string
          station_center_lat: number
          station_center_lng: number
          station_id: string
          station_name: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          expires_at: string
          id?: string
          station_center_lat: number
          station_center_lng: number
          station_id: string
          station_name: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          station_center_lat?: number
          station_center_lng?: number
          station_id?: string
          station_name?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar_color: string
          display_name: string
          id: string
          joined_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          avatar_color?: string
          display_name: string
          id?: string
          joined_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          avatar_color?: string
          display_name?: string
          id?: string
          joined_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_sessions: { Args: Record<PropertyKey, never>; Returns: undefined }
    }
    Enums: {
      poi_type: "meetpoint" | "danger" | "info"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience row types
export type Session    = Database["public"]["Tables"]["sessions"]["Row"]
export type TeamMember = Database["public"]["Tables"]["team_members"]["Row"]
export type Position   = Database["public"]["Tables"]["positions"]["Row"]
export type POI        = Database["public"]["Tables"]["pois"]["Row"]
export type POIType    = Database["public"]["Enums"]["poi_type"]
