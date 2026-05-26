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
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      job_evaluations: {
        Row: {
          chips: Json | null
          created_at: string | null
          detailed_reasoning: Json | null
          dimensions: Json | null
          id: string
          instant_alerted_at: string | null
          job_id: string | null
          notified_at: string | null
          read_at: string | null
          reasoning: string | null
          score: number
          user_id: string | null
        }
        Insert: {
          chips?: Json | null
          created_at?: string | null
          detailed_reasoning?: Json | null
          dimensions?: Json | null
          id?: string
          instant_alerted_at?: string | null
          job_id?: string | null
          notified_at?: string | null
          read_at?: string | null
          reasoning?: string | null
          score: number
          user_id?: string | null
        }
        Update: {
          chips?: Json | null
          created_at?: string | null
          detailed_reasoning?: Json | null
          dimensions?: Json | null
          id?: string
          instant_alerted_at?: string | null
          job_id?: string | null
          notified_at?: string | null
          read_at?: string | null
          reasoning?: string | null
          score?: number
          user_id?: string | null
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
          },
        ]
      }
      jobs: {
        Row: {
          categories: string[] | null
          company: string
          date_posted: string | null
          description: string | null
          detail_facts: Json | null
          employment_type: string[] | null
          experience_level: string | null
          external_id: string | null
          id: string
          industry: string | null
          is_active: boolean
          job_language: string | null
          job_updated_at: string | null
          location: string | null
          remote_type: string | null
          source: string
          source_domain: string | null
          synced_at: string | null
          title: string
          url: string
          working_hours: number | null
        }
        Insert: {
          categories?: string[] | null
          company: string
          date_posted?: string | null
          description?: string | null
          detail_facts?: Json | null
          employment_type?: string[] | null
          experience_level?: string | null
          external_id?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          job_language?: string | null
          job_updated_at?: string | null
          location?: string | null
          remote_type?: string | null
          source: string
          source_domain?: string | null
          synced_at?: string | null
          title: string
          url: string
          working_hours?: number | null
        }
        Update: {
          categories?: string[] | null
          company?: string
          date_posted?: string | null
          description?: string | null
          detail_facts?: Json | null
          employment_type?: string[] | null
          experience_level?: string | null
          external_id?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          job_language?: string | null
          job_updated_at?: string | null
          location?: string | null
          remote_type?: string | null
          source?: string
          source_domain?: string | null
          synced_at?: string | null
          title?: string
          url?: string
          working_hours?: number | null
        }
        Relationships: []
      }
      preferences: {
        Row: {
          company_sizes: string[]
          excluded_companies: string[] | null
          excluded_industries: string[] | null
          id: string
          last_dashboard_visit_at: string | null
          locations: string[] | null
          preferred_languages: string[]
          remote_preference: string | null
          score_threshold: number | null
          target_industries: string[] | null
          target_roles: RoleSelection[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_sizes?: string[]
          excluded_companies?: string[] | null
          excluded_industries?: string[] | null
          id?: string
          last_dashboard_visit_at?: string | null
          locations?: string[] | null
          preferred_languages?: string[]
          remote_preference?: string | null
          score_threshold?: number | null
          target_industries?: string[] | null
          target_roles?: RoleSelection[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_sizes?: string[]
          excluded_companies?: string[] | null
          excluded_industries?: string[] | null
          id?: string
          last_dashboard_visit_at?: string | null
          locations?: string[] | null
          preferred_languages?: string[]
          remote_preference?: string | null
          score_threshold?: number | null
          target_industries?: string[] | null
          target_roles?: RoleSelection[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          cv_summary: Json | null
          cv_text: string | null
          first_name: string | null
          id: string
          instant_alert_threshold: number | null
          last_name: string | null
          notifications_enabled: boolean | null
          onboarding_completed: boolean | null
          threshold: number | null
          updated_at: string | null
          years_experience: number
        }
        Insert: {
          created_at?: string | null
          cv_summary?: Json | null
          cv_text?: string | null
          first_name?: string | null
          id: string
          instant_alert_threshold?: number | null
          last_name?: string | null
          notifications_enabled?: boolean | null
          onboarding_completed?: boolean | null
          threshold?: number | null
          updated_at?: string | null
          years_experience?: number
        }
        Update: {
          created_at?: string | null
          cv_summary?: Json | null
          cv_text?: string | null
          first_name?: string | null
          id?: string
          instant_alert_threshold?: number | null
          last_name?: string | null
          notifications_enabled?: boolean | null
          onboarding_completed?: boolean | null
          threshold?: number | null
          updated_at?: string | null
          years_experience?: number
        }
        Relationships: []
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
      user_job_actions: {
        Row: {
          applied_at: string | null
          created_at: string | null
          id: string
          job_id: string | null
          status: Database["public"]["Enums"]["job_action_status"]
          user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          status: Database["public"]["Enums"]["job_action_status"]
          user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          status?: Database["public"]["Enums"]["job_action_status"]
          user_id?: string | null
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
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_job_feed_ranked: {
        Args: {
          p_lambda: number
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      job_action_status: "saved" | "dismissed" | "applied"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      job_action_status: ["saved", "dismissed", "applied"],
    },
  },
} as const
