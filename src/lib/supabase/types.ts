// Generated types will be placed here after running:
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
//
// For now, define manual types that match the schema:

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          cv_text: string | null
          threshold: number
          notifications_enabled: boolean
          onboarding_completed: boolean
          created_at: string
          updated_at: string
          first_name: string | null
          last_name: string | null
        }
        Insert: {
          id: string
          cv_text?: string | null
          threshold?: number
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
          first_name?: string | null
          last_name?: string | null
        }
        Update: {
          id?: string
          cv_text?: string | null
          threshold?: number
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
          first_name?: string | null
          last_name?: string | null
        }
        Relationships: []
      }
      preferences: {
        Row: {
          id: string
          user_id: string
          target_roles: string[]
          industries: string[]
          locations: string[]
          excluded_companies: string[]
          updated_at: string
          remote_preference: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
        }
        Insert: {
          id?: string
          user_id: string
          target_roles?: string[]
          industries?: string[]
          locations?: string[]
          excluded_companies?: string[]
          updated_at?: string
          remote_preference?: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
        }
        Update: {
          id?: string
          user_id?: string
          target_roles?: string[]
          industries?: string[]
          locations?: string[]
          excluded_companies?: string[]
          updated_at?: string
          remote_preference?: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          title: string
          company: string
          location: string | null
          url: string
          source: string
          description: string | null
          scraped_at: string
        }
        Insert: {
          id?: string
          title: string
          company: string
          location?: string | null
          url: string
          source: string
          description?: string | null
          scraped_at?: string
        }
        Update: {
          id?: string
          title?: string
          company?: string
          location?: string | null
          url?: string
          source?: string
          description?: string | null
          scraped_at?: string
        }
        Relationships: []
      }
      job_evaluations: {
        Row: {
          id: string
          job_id: string
          user_id: string
          score: number
          reasoning: string | null
          dimensions: Json | null
          detailed_reasoning: Json | null
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          user_id: string
          score: number
          reasoning?: string | null
          dimensions?: Json | null
          detailed_reasoning?: Json | null
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          user_id?: string
          score?: number
          reasoning?: string | null
          dimensions?: Json | null
          detailed_reasoning?: Json | null
          notified_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_evaluations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_evaluations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_job_actions: {
        Row: {
          id: string
          user_id: string
          job_id: string
          status: 'saved' | 'hidden' | 'applied'
          applied_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_id: string
          status: 'saved' | 'hidden' | 'applied'
          applied_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string
          status?: 'saved' | 'hidden' | 'applied'
          applied_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_job_actions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_job_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      job_action_status: 'saved' | 'hidden' | 'applied'
    }
    CompositeTypes: Record<string, never>
  }
}
