// src/lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type RoleSelection = {
  role: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          cv_text: string | null
          cv_summary: Json | null
          threshold: number
          notifications_enabled: boolean
          onboarding_completed: boolean
          created_at: string
          updated_at: string
          first_name: string | null
          last_name: string | null
          years_experience: number
          instant_alert_threshold: number | null
        }
        Insert: {
          id: string
          cv_text?: string | null
          cv_summary?: Json | null
          threshold?: number
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
          first_name?: string | null
          last_name?: string | null
          years_experience?: number
          instant_alert_threshold?: number | null
        }
        Update: {
          id?: string
          cv_text?: string | null
          cv_summary?: Json | null
          threshold?: number
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
          first_name?: string | null
          last_name?: string | null
          years_experience?: number
          instant_alert_threshold?: number | null
        }
        Relationships: []
      }
      preferences: {
        Row: {
          id: string
          user_id: string
          target_roles: RoleSelection[]
          target_industries: string[]
          excluded_industries: string[]
          locations: string[]
          excluded_companies: string[]
          updated_at: string
          remote_preference: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
          preferred_languages: string[]
          company_sizes: string[]
        }
        Insert: {
          id?: string
          user_id: string
          target_roles?: RoleSelection[]
          target_industries?: string[]
          excluded_industries?: string[]
          locations?: string[]
          excluded_companies?: string[]
          updated_at?: string
          remote_preference?: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
          preferred_languages?: string[]
          company_sizes?: string[]
        }
        Update: {
          id?: string
          user_id?: string
          target_roles?: RoleSelection[]
          target_industries?: string[]
          excluded_industries?: string[]
          locations?: string[]
          excluded_companies?: string[]
          updated_at?: string
          remote_preference?: 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'
          preferred_languages?: string[]
          company_sizes?: string[]
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          external_id: string | null
          title: string
          company: string
          location: string | null
          remote_type: string | null
          url: string
          source: string
          description: string | null
          date_posted: string | null
          job_updated_at: string | null
          industry: string | null
          is_active: boolean
          synced_at: string
          employment_type: string[] | null
          experience_level: string | null
          job_language: string | null
          working_hours: number | null
          source_domain: string | null
          detail_facts: Json | null
          categories: string[] | null
        }
        Insert: {
          id?: string
          external_id?: string | null
          title: string
          company: string
          location?: string | null
          remote_type?: string | null
          url: string
          source: string
          description?: string | null
          date_posted?: string | null
          job_updated_at?: string | null
          industry?: string | null
          is_active?: boolean
          synced_at?: string
          employment_type?: string[] | null
          experience_level?: string | null
          job_language?: string | null
          working_hours?: number | null
          source_domain?: string | null
          detail_facts?: Json | null
          categories?: string[] | null
        }
        Update: {
          id?: string
          external_id?: string | null
          title?: string
          company?: string
          location?: string | null
          remote_type?: string | null
          url?: string
          source?: string
          description?: string | null
          date_posted?: string | null
          job_updated_at?: string | null
          industry?: string | null
          is_active?: boolean
          synced_at?: string
          employment_type?: string[] | null
          experience_level?: string | null
          job_language?: string | null
          working_hours?: number | null
          source_domain?: string | null
          detail_facts?: Json | null
          categories?: string[] | null
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
          instant_alerted_at: string | null
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
          instant_alerted_at?: string | null
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
          instant_alerted_at?: string | null
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
      sync_state: {
        Row: {
          key: string
          last_synced_at: string
          updated_at: string
        }
        Insert: {
          key?: string
          last_synced_at: string
          updated_at?: string
        }
        Update: {
          key?: string
          last_synced_at?: string
          updated_at?: string
        }
        Relationships: []
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
