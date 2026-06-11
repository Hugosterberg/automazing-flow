export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_user_id: string | null
          business_profile_id: string
          created_at: string
          event_type: string
          id: string
          module: string
          occurred_at: string
          payload: Json
          severity: Database["public"]["Enums"]["activity_event_severity"]
          subject_id: string | null
          subject_type: string | null
          summary: string
        }
        Insert: {
          actor_user_id?: string | null
          business_profile_id: string
          created_at?: string
          event_type: string
          id?: string
          module: string
          occurred_at?: string
          payload?: Json
          severity?: Database["public"]["Enums"]["activity_event_severity"]
          subject_id?: string | null
          subject_type?: string | null
          summary: string
        }
        Update: {
          actor_user_id?: string | null
          business_profile_id?: string
          created_at?: string
          event_type?: string
          id?: string
          module?: string
          occurred_at?: string
          payload?: Json
          severity?: Database["public"]["Enums"]["activity_event_severity"]
          subject_id?: string | null
          subject_type?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recommendations: {
        Row: {
          business_profile_id: string
          confidence: number | null
          context: Json
          created_at: string
          expires_at: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_recommendation_kind"]
          module: string | null
          rationale: string | null
          related_id: string | null
          related_type: string | null
          status: Database["public"]["Enums"]["ai_recommendation_status"]
          suggested_action: Json
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          business_profile_id: string
          confidence?: number | null
          context?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ai_recommendation_kind"]
          module?: string | null
          rationale?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: Database["public"]["Enums"]["ai_recommendation_status"]
          suggested_action?: Json
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          business_profile_id?: string
          confidence?: number | null
          context?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_recommendation_kind"]
          module?: string | null
          rationale?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: Database["public"]["Enums"]["ai_recommendation_status"]
          suggested_action?: Json
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_reply_log: {
        Row: {
          author_name: string | null
          business_profile_id: string
          conversation_id: string | null
          created_at: string
          draft_text: string | null
          error: string | null
          external_id: string
          id: string
          incoming_text: string | null
          kind: string
          platform: string | null
          status: string
          zernio_account_id: string | null
        }
        Insert: {
          author_name?: string | null
          business_profile_id: string
          conversation_id?: string | null
          created_at?: string
          draft_text?: string | null
          error?: string | null
          external_id: string
          id?: string
          incoming_text?: string | null
          kind?: string
          platform?: string | null
          status: string
          zernio_account_id?: string | null
        }
        Update: {
          author_name?: string | null
          business_profile_id?: string
          conversation_id?: string | null
          created_at?: string
          draft_text?: string | null
          error?: string | null
          external_id?: string
          id?: string
          incoming_text?: string | null
          kind?: string
          platform?: string | null
          status?: string
          zernio_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_reply_log_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          business_profile_id: string
          created_at: string
          dm_auto_reply_enabled: boolean
          dm_auto_reply_mode: string
          instructions: string
          language: string
          tone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_profile_id: string
          created_at?: string
          dm_auto_reply_enabled?: boolean
          dm_auto_reply_mode?: string
          instructions?: string
          language?: string
          tone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_profile_id?: string
          created_at?: string
          dm_auto_reply_enabled?: boolean
          dm_auto_reply_mode?: string
          instructions?: string
          language?: string
          tone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: true
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          kind: string
          location: string | null
          name: string
          notes: string | null
          owner_user_id: string
          phone: string | null
          slug: string | null
          status: Database["public"]["Enums"]["business_profile_status"]
          updated_at: string
          website: string | null
          zernio_profile_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kind?: string
          location?: string | null
          name: string
          notes?: string | null
          owner_user_id: string
          phone?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["business_profile_status"]
          updated_at?: string
          website?: string | null
          zernio_profile_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kind?: string
          location?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string
          phone?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["business_profile_status"]
          updated_at?: string
          website?: string | null
          zernio_profile_id?: string | null
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          analysis: Json | null
          avatar_url: string | null
          business_profile_id: string | null
          connected_at: string
          disconnected_at: string | null
          display_name: string | null
          health: string
          id: string
          is_oauth: boolean
          is_zernio: boolean
          last_successful_sync_at: string | null
          last_sync_error: string | null
          last_synced_at: string | null
          platform: string
          profile_id: string
          profile_url: string | null
          stats: Json | null
          user_id: string
          username: string
          zernio_account_id: string | null
        }
        Insert: {
          analysis?: Json | null
          avatar_url?: string | null
          business_profile_id?: string | null
          connected_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          health?: string
          id: string
          is_oauth?: boolean
          is_zernio?: boolean
          last_successful_sync_at?: string | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          platform: string
          profile_id: string
          profile_url?: string | null
          stats?: Json | null
          user_id: string
          username: string
          zernio_account_id?: string | null
        }
        Update: {
          analysis?: Json | null
          avatar_url?: string | null
          business_profile_id?: string | null
          connected_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          health?: string
          id?: string
          is_oauth?: boolean
          is_zernio?: boolean
          last_successful_sync_at?: string | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          platform?: string
          profile_id?: string
          profile_url?: string | null
          stats?: Json | null
          user_id?: string
          username?: string
          zernio_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          business_profile_id: string
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value_ciphertext: string
          value_iv: string
          value_tag: string
        }
        Insert: {
          business_profile_id: string
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value_ciphertext: string
          value_iv: string
          value_tag: string
        }
        Update: {
          business_profile_id?: string
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value_ciphertext?: string
          value_iv?: string
          value_tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          category: Database["public"]["Enums"]["integration_category"]
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          name: string
          provider: string
          slug: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["integration_category"]
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name: string
          provider?: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["integration_category"]
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          provider?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          business_profile_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          business_profile_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          business_profile_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_pending_states: {
        Row: {
          created_at: string
          expires_at: string
          payload: Json
          state: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          payload: Json
          state: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          payload?: Json
          state?: string
        }
        Relationships: []
      }
      oauth_token_entries: {
        Row: {
          account_id: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          payload: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          business_profile_id: string
          connected_account_id: string | null
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          items_processed: number
          kind: Database["public"]["Enums"]["sync_run_kind"]
          metadata: Json
          started_at: string | null
          status: Database["public"]["Enums"]["sync_run_status"]
        }
        Insert: {
          business_profile_id: string
          connected_account_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_processed?: number
          kind?: Database["public"]["Enums"]["sync_run_kind"]
          metadata?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
        }
        Update: {
          business_profile_id?: string
          connected_account_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_processed?: number
          kind?: Database["public"]["Enums"]["sync_run_kind"]
          metadata?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "v_connection_health"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          business_profile_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          metadata: Json
          module: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          related_id: string | null
          related_type: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_profile_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          module?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          related_id?: string | null
          related_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_profile_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          module?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          related_id?: string | null
          related_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_business_profile_id: string | null
          display_name: string | null
          id: string
          locale: string | null
          preferences: Json
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_business_profile_id?: string | null
          display_name?: string | null
          id: string
          locale?: string | null
          preferences?: Json
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_business_profile_id?: string | null
          display_name?: string | null
          id?: string
          locale?: string | null
          preferences?: Json
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_default_business_profile_id_fkey"
            columns: ["default_business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_connection_health: {
        Row: {
          analysis: Json | null
          avatar_url: string | null
          business_profile_id: string | null
          connected_at: string | null
          disconnected_at: string | null
          display_name: string | null
          health: string | null
          id: string | null
          integration_category:
            | Database["public"]["Enums"]["integration_category"]
            | null
          integration_name: string | null
          integration_provider: string | null
          is_oauth: boolean | null
          is_zernio: boolean | null
          last_successful_sync_at: string | null
          last_sync_error: string | null
          last_synced_at: string | null
          platform: string | null
          profile_id: string | null
          profile_url: string | null
          stats: Json | null
          user_id: string | null
          username: string | null
          zernio_account_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_bp_owner: { Args: { bp_id: string }; Returns: boolean }
      is_member: { Args: { bp_id: string }; Returns: boolean }
      is_member_with_role: {
        Args: { bp_id: string; roles: string[] }
        Returns: boolean
      }
    }
    Enums: {
      activity_event_severity: "info" | "success" | "warning" | "error"
      ai_recommendation_kind:
        | "content"
        | "outreach"
        | "engagement"
        | "maintenance"
        | "insight"
      ai_recommendation_status:
        | "new"
        | "seen"
        | "accepted"
        | "dismissed"
        | "expired"
      business_profile_status: "active" | "suspended" | "archived"
      integration_category:
        | "social"
        | "communication"
        | "calendar"
        | "reviews"
        | "content"
        | "ecommerce"
        | "mail"
        | "analytics"
        | "custom"
      sync_run_kind:
        | "full"
        | "delta"
        | "reconcile"
        | "refresh_token"
        | "backfill"
      sync_run_status:
        | "queued"
        | "running"
        | "success"
        | "partial"
        | "failed"
        | "cancelled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "open" | "in_progress" | "blocked" | "done" | "archived"
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
      activity_event_severity: ["info", "success", "warning", "error"],
      ai_recommendation_kind: [
        "content",
        "outreach",
        "engagement",
        "maintenance",
        "insight",
      ],
      ai_recommendation_status: [
        "new",
        "seen",
        "accepted",
        "dismissed",
        "expired",
      ],
      business_profile_status: ["active", "suspended", "archived"],
      integration_category: [
        "social",
        "communication",
        "calendar",
        "reviews",
        "content",
        "ecommerce",
        "mail",
        "analytics",
        "custom",
      ],
      sync_run_kind: [
        "full",
        "delta",
        "reconcile",
        "refresh_token",
        "backfill",
      ],
      sync_run_status: [
        "queued",
        "running",
        "success",
        "partial",
        "failed",
        "cancelled",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["open", "in_progress", "blocked", "done", "archived"],
    },
  },
} as const
