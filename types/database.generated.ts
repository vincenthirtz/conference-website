// types/database.generated.ts — GÉNÉRÉ, ne pas éditer à la main.
//
// Source : generate_typescript_types sur le projet Supabase `owwomenscup`
// (lot L5, docs/PLAN-industrialisation-admin.md). Régénérer après toute
// migration qui touche au schéma, EN MÊME TEMPS que l'instantané
// (`node scripts/refresh-schema-snapshot.mjs`) : le test
// `databaseTypesFreshness` compare les colonnes des deux, table par table.

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adherent_payments: {
        Row: {
          adherent_id: string
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          payment_reference: string | null
          year: number
        }
        Insert: {
          adherent_id: string
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          payment_reference?: string | null
          year: number
        }
        Update: {
          adherent_id?: string
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "adherent_payments_adherent_id_fkey"
            columns: ["adherent_id"]
            isOneToOne: false
            referencedRelation: "adherents"
            referencedColumns: ["id"]
          },
        ]
      }
      adherents: {
        Row: {
          address: string | null
          auth_user_id: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          current_year: number
          deleted_at: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean | null
          join_date: string
          last_name: string
          member_number: string | null
          notes: string | null
          payment_amount: number | null
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          phone: string | null
          postal_code: string | null
          role: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          auth_user_id?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          current_year?: number
          deleted_at?: string | null
          email: string
          first_name: string
          id?: string
          is_active?: boolean | null
          join_date?: string
          last_name: string
          member_number?: string | null
          notes?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          phone?: string | null
          postal_code?: string | null
          role?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          auth_user_id?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          current_year?: number
          deleted_at?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean | null
          join_date?: string
          last_name?: string
          member_number?: string | null
          notes?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          phone?: string | null
          postal_code?: string | null
          role?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_idempotency: {
        Row: {
          body: Json
          cache_key: string
          created_at: string
          expires_at: string
          id: number
          status: number
          tenant_id: string
        }
        Insert: {
          body: Json
          cache_key: string
          created_at?: string
          expires_at: string
          id?: number
          status: number
          tenant_id: string
        }
        Update: {
          body?: Json
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: number
          status?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_idempotency_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_url: string | null
          deleted_at: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          message: string
          priority: number
          starts_at: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          priority?: number
          starts_at?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          priority?: number
          starts_at?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_counters: {
        Row: {
          alerted_at: string | null
          alerted_threshold: number | null
          count: number
          tenant_id: string
          updated_at: string
          window_key: string
          window_kind: string
        }
        Insert: {
          alerted_at?: string | null
          alerted_threshold?: number | null
          count?: number
          tenant_id: string
          updated_at?: string
          window_key: string
          window_kind: string
        }
        Update: {
          alerted_at?: string | null
          alerted_threshold?: number | null
          count?: number
          tenant_id?: string
          updated_at?: string
          window_key?: string
          window_kind?: string
        }
        Relationships: []
      }
      association_pole_members: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          name: string
          pole_key: string
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          name: string
          pole_key: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          name?: string
          pole_key?: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      blacklist_alerts: {
        Row: {
          battle_tag: string | null
          blacklist_entry_id: string | null
          context: string | null
          created_at: string
          criteria: Json | null
          discord_user_id: string | null
          display_name: string | null
          id: string
          matched_on: string
          reason: string | null
          source: string
          strength: string
          tenant_id: string
        }
        Insert: {
          battle_tag?: string | null
          blacklist_entry_id?: string | null
          context?: string | null
          created_at?: string
          criteria?: Json | null
          discord_user_id?: string | null
          display_name?: string | null
          id?: string
          matched_on: string
          reason?: string | null
          source: string
          strength: string
          tenant_id: string
        }
        Update: {
          battle_tag?: string | null
          blacklist_entry_id?: string | null
          context?: string | null
          created_at?: string
          criteria?: Json | null
          discord_user_id?: string | null
          display_name?: string | null
          id?: string
          matched_on?: string
          reason?: string | null
          source?: string
          strength?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_alerts_blacklist_entry_id_fkey"
            columns: ["blacklist_entry_id"]
            isOneToOne: false
            referencedRelation: "player_blacklist"
            referencedColumns: ["id"]
          },
        ]
      }
      blizzard_media: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          link: string
          parts: number | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          link: string
          parts?: number | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          link?: string
          parts?: number | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      blizzard_news: {
        Row: {
          category: string | null
          created_at: string | null
          date: string
          date_parsed: string | null
          id: string
          image_url: string | null
          link: string
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          date: string
          date_parsed?: string | null
          id: string
          image_url?: string | null
          link: string
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          date?: string
          date_parsed?: string | null
          id?: string
          image_url?: string | null
          link?: string
          summary?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bot_event_outbox: {
        Row: {
          created_at: string
          delivered_at: string | null
          event_id: string
          event_name: string
          id: number
          last_push_at: string | null
          last_push_error: string | null
          payload: Json
          push_attempts: number
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          event_id: string
          event_name: string
          id?: number
          last_push_at?: string | null
          last_push_error?: string | null
          payload: Json
          push_attempts?: number
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          event_id?: string
          event_name?: string
          id?: number
          last_push_at?: string | null
          last_push_error?: string | null
          payload?: Json
          push_attempts?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_event_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_idempotency: {
        Row: {
          body: Json
          cache_key: string
          created_at: string
          expires_at: string
          id: number
          status: number
          tenant_id: string
        }
        Insert: {
          body: Json
          cache_key: string
          created_at?: string
          expires_at: string
          id?: number
          status: number
          tenant_id: string
        }
        Update: {
          body?: Json
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: number
          status?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_idempotency_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          holder: string
          name: string
          tenant_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          holder: string
          name: string
          tenant_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          holder?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_locks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_player_actions: {
        Row: {
          action: string
          actor_auth_user_id: string
          actor_discord_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          payload: Json | null
          target_auth_user_id: string | null
          target_discord_user_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_auth_user_id: string
          actor_discord_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          payload?: Json | null
          target_auth_user_id?: string | null
          target_discord_user_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_auth_user_id?: string
          actor_discord_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          payload?: Json | null
          target_auth_user_id?: string | null
          target_discord_user_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_player_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_snapshots: {
        Row: {
          id: number
          match_count: number
          matches_snapshot: Json
          reason: string | null
          stage_id: string
          taken_at: string
          taken_by_staff_id: string | null
          tenant_id: string
        }
        Insert: {
          id?: number
          match_count?: number
          matches_snapshot: Json
          reason?: string | null
          stage_id: string
          taken_at?: string
          taken_by_staff_id?: string | null
          tenant_id: string
        }
        Update: {
          id?: number
          match_count?: number
          matches_snapshot?: Json
          reason?: string | null
          stage_id?: string
          taken_at?: string
          taken_by_staff_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bracket_snapshots_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_snapshots_taken_by_staff_id_fkey"
            columns: ["taken_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_email_optouts: {
        Row: {
          email: string
          source: string | null
          unsubscribed_at: string
        }
        Insert: {
          email: string
          source?: string | null
          unsubscribed_at?: string
        }
        Update: {
          email?: string
          source?: string | null
          unsubscribed_at?: string
        }
        Relationships: []
      }
      broadcast_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error: string | null
          label: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error?: string | null
          label?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error?: string | null
          label?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      broadcast_schedules: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          last_wave_at: string | null
          status: string
          total_recipients: number
          updated_at: string
          wave_size: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          last_wave_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
          wave_size?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          last_wave_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
          wave_size?: number
        }
        Relationships: []
      }
      captcha_challenges: {
        Row: {
          answer_hash: string
          attempts: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          nonce: string
        }
        Insert: {
          answer_hash: string
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          nonce: string
        }
        Update: {
          answer_hash?: string
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce?: string
        }
        Relationships: []
      }
      cast_assignments: {
        Row: {
          acked_at: string | null
          briefing_at: string
          briefing_reminder_sent_at: string | null
          cast_member_id: string
          created_at: string
          id: string
          match_id: string | null
          role: string | null
          scrim_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acked_at?: string | null
          briefing_at: string
          briefing_reminder_sent_at?: string | null
          cast_member_id: string
          created_at?: string
          id?: string
          match_id?: string | null
          role?: string | null
          scrim_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acked_at?: string | null
          briefing_at?: string
          briefing_reminder_sent_at?: string | null
          cast_member_id?: string
          created_at?: string
          id?: string
          match_id?: string | null
          role?: string | null
          scrim_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_assignments_cast_member_id_fkey"
            columns: ["cast_member_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cast_assignments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cast_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cast_assignments_scrim"
            columns: ["scrim_id"]
            isOneToOne: false
            referencedRelation: "scrims"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_members: {
        Row: {
          auth_user_id: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_internal: boolean
          is_promo: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
          title: string | null
          twitch_url: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_internal?: boolean
          is_promo?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
          title?: string | null
          twitch_url?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_internal?: boolean
          is_promo?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
          title?: string | null
          twitch_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cast_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      caster_presence: {
        Row: {
          cast_member_id: string
          event_run_id: string | null
          last_seen_at: string
          tenant_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          cast_member_id: string
          event_run_id?: string | null
          last_seen_at?: string
          tenant_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          cast_member_id?: string
          event_run_id?: string | null
          last_seen_at?: string
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caster_presence_cast_member_id_fkey"
            columns: ["cast_member_id"]
            isOneToOne: true
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caster_presence_event_run_id_fkey"
            columns: ["event_run_id"]
            isOneToOne: false
            referencedRelation: "event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caster_presence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      caster_scenes: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          overlay: string | null
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          name: string
          overlay?: string | null
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          overlay?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      caster_themes: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      circuit_partner_applications: {
        Row: {
          admin_notes: string | null
          commits_code_of_conduct: boolean
          commits_safety_lead: boolean
          community_url: string | null
          contact_name: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          existing_tenant_slug: string | null
          expected_teams: number | null
          format: string
          game: string
          granted_plan: string | null
          granted_tenant_id: string | null
          granted_until: string | null
          id: string
          ip_address: string | null
          message: string
          organization_name: string
          season_start: string | null
          status: string
          updated_at: string
          user_agent: string | null
          website: string | null
        }
        Insert: {
          admin_notes?: string | null
          commits_code_of_conduct: boolean
          commits_safety_lead: boolean
          community_url?: string | null
          contact_name: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          existing_tenant_slug?: string | null
          expected_teams?: number | null
          format: string
          game: string
          granted_plan?: string | null
          granted_tenant_id?: string | null
          granted_until?: string | null
          id?: string
          ip_address?: string | null
          message: string
          organization_name: string
          season_start?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          website?: string | null
        }
        Update: {
          admin_notes?: string | null
          commits_code_of_conduct?: boolean
          commits_safety_lead?: boolean
          community_url?: string | null
          contact_name?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          existing_tenant_slug?: string | null
          expected_teams?: number | null
          format?: string
          game?: string
          granted_plan?: string | null
          granted_tenant_id?: string | null
          granted_until?: string | null
          id?: string
          ip_address?: string | null
          message?: string
          organization_name?: string
          season_start?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circuit_partner_applications_granted_tenant_id_fkey"
            columns: ["granted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_game_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          game: string
          id: string
          import_code: string
          map_pool: Json
          name: string
          stage_id: string | null
          tenant_id: string
          tournament_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          game?: string
          id?: string
          import_code: string
          map_pool?: Json
          name: string
          stage_id?: string | null
          tenant_id: string
          tournament_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          game?: string
          id?: string
          import_code?: string
          map_pool?: Json
          name?: string
          stage_id?: string | null
          tenant_id?: string
          tournament_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_game_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demandes: {
        Row: {
          assigned_at: string | null
          assigned_staff_id: string | null
          auth_user_id: string | null
          comment: string | null
          created_at: string
          handled_at: string | null
          handled_by_staff_id: string | null
          id: string
          message: string | null
          metadata: Json | null
          payload: Json | null
          processed_at: string | null
          processed_by_staff_id: string | null
          source: string | null
          staff_note: string | null
          status: string
          team_id: string | null
          tenant_id: string
          tournament_id: string | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_staff_id?: string | null
          auth_user_id?: string | null
          comment?: string | null
          created_at?: string
          handled_at?: string | null
          handled_by_staff_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          payload?: Json | null
          processed_at?: string | null
          processed_by_staff_id?: string | null
          source?: string | null
          staff_note?: string | null
          status?: string
          team_id?: string | null
          tenant_id: string
          tournament_id?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_staff_id?: string | null
          auth_user_id?: string | null
          comment?: string | null
          created_at?: string
          handled_at?: string | null
          handled_by_staff_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          payload?: Json | null
          processed_at?: string | null
          processed_by_staff_id?: string | null
          source?: string | null
          staff_note?: string | null
          status?: string
          team_id?: string | null
          tenant_id?: string
          tournament_id?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demandes_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_processed_by_staff_id_fkey"
            columns: ["processed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_event_ack: {
        Row: {
          event_id: string
          handled_at: string
          source: string | null
        }
        Insert: {
          event_id: string
          handled_at?: string
          source?: string | null
        }
        Update: {
          event_id?: string
          handled_at?: string
          source?: string | null
        }
        Relationships: []
      }
      discord_guild_presence: {
        Row: {
          checked_at: string
          discord_user_id: string
          in_guild: boolean
          tenant_id: string
        }
        Insert: {
          checked_at?: string
          discord_user_id: string
          in_guild: boolean
          tenant_id: string
        }
        Update: {
          checked_at?: string
          discord_user_id?: string
          in_guild?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_guild_presence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_guilds: {
        Row: {
          created_at: string
          guild_id: string
          is_primary: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          guild_id: string
          is_primary?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          guild_id?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_guilds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_webhooks: {
        Row: {
          channel_type: string
          created_at: string
          id: string
          is_active: boolean
          last_post_at: string | null
          last_post_status: string | null
          role_mention: string | null
          tenant_id: string
          tournament_id: string | null
          updated_at: string
          webhook_url: string
        }
        Insert: {
          channel_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_post_at?: string | null
          last_post_status?: string | null
          role_mention?: string | null
          tenant_id: string
          tournament_id?: string | null
          updated_at?: string
          webhook_url: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_post_at?: string | null
          last_post_status?: string | null
          role_mention?: string | null
          tenant_id?: string
          tournament_id?: string | null
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discord_webhooks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience: string
          body_format: string
          body_html: string | null
          body_paragraphs: Json
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          description: string
          footer_note: string | null
          greeting_enabled: boolean
          heading: string
          id: string
          name: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body_format?: string
          body_html?: string | null
          body_paragraphs?: Json
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          description?: string
          footer_note?: string | null
          greeting_enabled?: boolean
          heading: string
          id: string
          name: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body_format?: string
          body_html?: string | null
          body_paragraphs?: Json
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          description?: string
          footer_note?: string | null
          greeting_enabled?: boolean
          heading?: string
          id?: string
          name?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_deliveries: {
        Row: {
          created_at: string
          id: number
          outbox_event_id: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          outbox_event_id: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          outbox_event_id?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_blacklist: {
        Row: {
          active: boolean
          banned_by: string | null
          created_at: string
          entity_type: string
          expires_at: string | null
          id: string
          name: string
          notes: string | null
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          banned_by?: string | null
          created_at?: string
          entity_type: string
          expires_at?: string | null
          id?: string
          name: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          banned_by?: string | null
          created_at?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_cue_acks: {
        Row: {
          acked_at: string
          cast_member_id: string
          cue_id: string
          tenant_id: string
        }
        Insert: {
          acked_at?: string
          cast_member_id: string
          cue_id: string
          tenant_id: string
        }
        Update: {
          acked_at?: string
          cast_member_id?: string
          cue_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cue_acks_cast_member_id_fkey"
            columns: ["cast_member_id"]
            isOneToOne: false
            referencedRelation: "cast_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cue_acks_cue_id_fkey"
            columns: ["cue_id"]
            isOneToOne: false
            referencedRelation: "event_cues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cue_acks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cues: {
        Row: {
          body: string
          created_at: string
          created_by_user_id: string | null
          dedup_key: string | null
          event_run_id: string
          expires_at: string | null
          id: string
          retracted_at: string | null
          retracted_by_user_id: string | null
          severity: string
          tenant_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by_user_id?: string | null
          dedup_key?: string | null
          event_run_id: string
          expires_at?: string | null
          id?: string
          retracted_at?: string | null
          retracted_by_user_id?: string | null
          severity: string
          tenant_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by_user_id?: string | null
          dedup_key?: string | null
          event_run_id?: string
          expires_at?: string | null
          id?: string
          retracted_at?: string | null
          retracted_by_user_id?: string | null
          severity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cues_event_run_id_fkey"
            columns: ["event_run_id"]
            isOneToOne: false
            referencedRelation: "event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_runs: {
        Row: {
          broadcast_state: Json
          created_at: string
          description: string | null
          ended_at: string | null
          id: string
          name: string
          scheduled_at: string
          slug: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          broadcast_state?: Json
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          name: string
          scheduled_at: string
          slug: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          broadcast_state?: Json
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          name?: string
          scheduled_at?: string
          slug?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_segments: {
        Row: {
          broadcast_message: Json | null
          caster_checklist: Json
          created_at: string
          duration_min: number | null
          ended_at: string | null
          event_run_id: string
          id: string
          match_id: string | null
          obs_scene: string | null
          ord: number
          planned_start_at: string | null
          started_at: string | null
          station_id: string | null
          status: string
          tenant_id: string
          title: string
          type: string
          updated_at: string
          wave_id: string | null
        }
        Insert: {
          broadcast_message?: Json | null
          caster_checklist?: Json
          created_at?: string
          duration_min?: number | null
          ended_at?: string | null
          event_run_id: string
          id?: string
          match_id?: string | null
          obs_scene?: string | null
          ord: number
          planned_start_at?: string | null
          started_at?: string | null
          station_id?: string | null
          status?: string
          tenant_id: string
          title: string
          type: string
          updated_at?: string
          wave_id?: string | null
        }
        Update: {
          broadcast_message?: Json | null
          caster_checklist?: Json
          created_at?: string
          duration_min?: number | null
          ended_at?: string | null
          event_run_id?: string
          id?: string
          match_id?: string | null
          obs_scene?: string | null
          ord?: number
          planned_start_at?: string | null
          started_at?: string | null
          station_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
          wave_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_segments_event_run_id_fkey"
            columns: ["event_run_id"]
            isOneToOne: false
            referencedRelation: "event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_segments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_segments_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "event_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_segments_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "event_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stations: {
        Row: {
          created_at: string
          event_run_id: string
          id: string
          name: string
          notes: string | null
          ord: number
          status: string
          stream_url: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_run_id: string
          id?: string
          name: string
          notes?: string | null
          ord?: number
          status?: string
          stream_url?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_run_id?: string
          id?: string
          name?: string
          notes?: string | null
          ord?: number
          status?: string
          stream_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_stations_event_run_id_fkey"
            columns: ["event_run_id"]
            isOneToOne: false
            referencedRelation: "event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waves: {
        Row: {
          created_at: string
          duration_min: number | null
          ended_at: string | null
          event_run_id: string
          id: string
          ord: number
          planned_start_at: string | null
          started_at: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_min?: number | null
          ended_at?: string | null
          event_run_id: string
          id?: string
          ord: number
          planned_start_at?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_min?: number | null
          ended_at?: string | null
          event_run_id?: string
          id?: string
          ord?: number
          planned_start_at?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_waves_event_run_id_fkey"
            columns: ["event_run_id"]
            isOneToOne: false
            referencedRelation: "event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_waves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      final_rankings: {
        Row: {
          created_at: string
          frozen_at: string
          frozen_by_staff_id: string | null
          id: string
          notes: string | null
          prize: string | null
          rank: number
          team_id: string
          tenant_id: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          frozen_at?: string
          frozen_by_staff_id?: string | null
          id?: string
          notes?: string | null
          prize?: string | null
          rank: number
          team_id: string
          tenant_id: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          frozen_at?: string
          frozen_by_staff_id?: string | null
          id?: string
          notes?: string | null
          prize?: string | null
          rank?: number
          team_id?: string
          tenant_id?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_final_rankings_staff"
            columns: ["frozen_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_final_rankings_team"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_final_rankings_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_final_rankings_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      free_players: {
        Row: {
          auth_user_id: string | null
          availability: string | null
          contact_discord: string | null
          contact_email: string | null
          discord_announce_channel_id: string | null
          discord_announce_message_id: string | null
          discord_user_id: string | null
          discord_username: string | null
          display_name: string | null
          expires_at: string | null
          expiry_reminder_sent_at: string | null
          id: string
          level: string | null
          marked_at: string
          note: string | null
          roles: string[]
          share_across_tenants: boolean
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          availability?: string | null
          contact_discord?: string | null
          contact_email?: string | null
          discord_announce_channel_id?: string | null
          discord_announce_message_id?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          id?: string
          level?: string | null
          marked_at?: string
          note?: string | null
          roles?: string[]
          share_across_tenants?: boolean
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          availability?: string | null
          contact_discord?: string | null
          contact_email?: string | null
          discord_announce_channel_id?: string | null
          discord_announce_message_id?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          id?: string
          level?: string | null
          marked_at?: string
          note?: string | null
          roles?: string[]
          share_across_tenants?: boolean
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "free_players_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      game_heroes: {
        Row: {
          attribute: string | null
          created_at: string
          data: Json
          enabled: boolean
          external_id: string
          fetched_at: string | null
          game: string
          icon_url: string | null
          id: string
          image_url: string
          key: string
          name: string
          roles: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          attribute?: string | null
          created_at?: string
          data?: Json
          enabled?: boolean
          external_id: string
          fetched_at?: string | null
          game: string
          icon_url?: string | null
          id?: string
          image_url: string
          key: string
          name: string
          roles?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          attribute?: string | null
          created_at?: string
          data?: Json
          enabled?: boolean
          external_id?: string
          fetched_at?: string | null
          game?: string
          icon_url?: string | null
          id?: string
          image_url?: string
          key?: string
          name?: string
          roles?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          hero_bans: Json
          id: string
          is_tiebreaker: boolean | null
          map_name: string | null
          map_order: number | null
          match_id: string
          picked_by_team_id: string | null
          team1_score: number | null
          team2_score: number | null
          tenant_id: string
          updated_at: string | null
          went_overtime: boolean | null
          winner_team_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          hero_bans?: Json
          id?: string
          is_tiebreaker?: boolean | null
          map_name?: string | null
          map_order?: number | null
          match_id: string
          picked_by_team_id?: string | null
          team1_score?: number | null
          team2_score?: number | null
          tenant_id: string
          updated_at?: string | null
          went_overtime?: boolean | null
          winner_team_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          hero_bans?: Json
          id?: string
          is_tiebreaker?: boolean | null
          map_name?: string | null
          map_order?: number | null
          match_id?: string
          picked_by_team_id?: string | null
          team1_score?: number | null
          team2_score?: number | null
          tenant_id?: string
          updated_at?: string | null
          went_overtime?: boolean | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_match_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_picked_by_team_id_fkey"
            columns: ["picked_by_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      helloasso_donations: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          form_slug: string | null
          form_type: string | null
          helloasso_payment_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          form_slug?: string | null
          form_type?: string | null
          helloasso_payment_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          form_slug?: string | null
          form_type?: string | null
          helloasso_payment_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helloasso_donations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value_encrypted: string
        }
        Insert: {
          key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value_encrypted: string
        }
        Update: {
          key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value_encrypted?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_secrets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      league_scrims: {
        Row: {
          created_at: string
          league_id: string
          scrim_id: string
          tenant_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          league_id: string
          scrim_id: string
          tenant_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          league_id?: string
          scrim_id?: string
          tenant_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_scrims_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_scrims_scrim_id_fkey"
            columns: ["scrim_id"]
            isOneToOne: false
            referencedRelation: "scrims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_scrims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_standings: {
        Row: {
          best_rank: number | null
          created_at: string
          id: string
          league_id: string
          points: number
          rank: number | null
          scrims_counted: number
          team_id: string
          tenant_id: string
          tournaments_counted: number
          updated_at: string
        }
        Insert: {
          best_rank?: number | null
          created_at?: string
          id?: string
          league_id: string
          points?: number
          rank?: number | null
          scrims_counted?: number
          team_id: string
          tenant_id: string
          tournaments_counted?: number
          updated_at?: string
        }
        Update: {
          best_rank?: number | null
          created_at?: string
          id?: string
          league_id?: string
          points?: number
          rank?: number | null
          scrims_counted?: number
          team_id?: string
          tenant_id?: string
          tournaments_counted?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_standings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_tournaments: {
        Row: {
          created_at: string
          league_id: string
          tenant_id: string
          tournament_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          league_id: string
          tenant_id: string
          tournament_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          league_id?: string
          tenant_id?: string
          tournament_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_tournaments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_tournaments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_tournaments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          game: string | null
          id: string
          is_public: boolean
          name: string
          points_table: Json
          slug: string
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          game?: string | null
          id?: string
          is_public?: boolean
          name: string
          points_table?: Json
          slug: string
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          game?: string | null
          id?: string
          is_public?: boolean
          name?: string
          points_table?: Json
          slug?: string
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lobbies: {
        Row: {
          best_of: number | null
          created_at: string
          id: string
          name: string | null
          round_number: number | null
          stage_id: string | null
          status: string
          tenant_id: string
          tournament_id: string
        }
        Insert: {
          best_of?: number | null
          created_at?: string
          id?: string
          name?: string | null
          round_number?: number | null
          stage_id?: string | null
          status?: string
          tenant_id: string
          tournament_id: string
        }
        Update: {
          best_of?: number | null
          created_at?: string
          id?: string
          name?: string | null
          round_number?: number | null
          stage_id?: string | null
          status?: string
          tenant_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobbies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_placements: {
        Row: {
          created_at: string
          id: string
          lobby_id: string
          placement: number | null
          points: number | null
          score: number | null
          team_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lobby_id: string
          placement?: number | null
          points?: number | null
          score?: number | null
          team_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lobby_id?: string
          placement?: number | null
          points?: number | null
          score?: number | null
          team_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_placements_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_placements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_draft_steps: {
        Row: {
          action: string
          auto_picked: boolean
          committed_at: string | null
          created_at: string
          deadline_at: string | null
          draft_id: string
          hero_id: string | null
          id: string
          phase: string
          side: string
          step_number: number
        }
        Insert: {
          action: string
          auto_picked?: boolean
          committed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          draft_id: string
          hero_id?: string | null
          id?: string
          phase: string
          side: string
          step_number: number
        }
        Update: {
          action?: string
          auto_picked?: boolean
          committed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          draft_id?: string
          hero_id?: string | null
          id?: string
          phase?: string
          side?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_draft_steps_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "match_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_draft_steps_hero_id_fkey"
            columns: ["hero_id"]
            isOneToOne: false
            referencedRelation: "game_heroes"
            referencedColumns: ["id"]
          },
        ]
      }
      match_drafts: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          fearless: boolean
          game: string
          game_index: number
          id: string
          match_id: string
          pick_timer_seconds: number
          started_at: string | null
          status: string
          team1_side: string | null
          team2_side: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          fearless?: boolean
          game: string
          game_index: number
          id?: string
          match_id: string
          pick_timer_seconds?: number
          started_at?: string | null
          status?: string
          team1_side?: string | null
          team2_side?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          fearless?: boolean
          game?: string
          game_index?: number
          id?: string
          match_id?: string
          pick_timer_seconds?: number
          started_at?: string | null
          status?: string
          team1_side?: string | null
          team2_side?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_drafts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_evidence: {
        Row: {
          created_at: string
          discord_user_id: string | null
          external_url: string | null
          id: string
          kind: string
          match_id: string
          mime_type: string | null
          note: string | null
          sha256: string | null
          size_bytes: number | null
          storage_path: string | null
          submitted_by_auth_user_id: string | null
          team_side: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          discord_user_id?: string | null
          external_url?: string | null
          id?: string
          kind: string
          match_id: string
          mime_type?: string | null
          note?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          submitted_by_auth_user_id?: string | null
          team_side?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          discord_user_id?: string | null
          external_url?: string | null
          id?: string
          kind?: string
          match_id?: string
          mime_type?: string | null
          note?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          submitted_by_auth_user_id?: string | null
          team_side?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_evidence_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_lineups: {
        Row: {
          created_at: string
          match_id: string
          status: string
          team_id: string
          tenant_id: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validated_by_kind: string | null
        }
        Insert: {
          created_at?: string
          match_id: string
          status?: string
          team_id: string
          tenant_id: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_by_kind?: string | null
        }
        Update: {
          created_at?: string
          match_id?: string
          status?: string
          team_id?: string
          tenant_id?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_by_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_lineups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_map_vetos: {
        Row: {
          action: string
          created_at: string
          id: string
          map_name: string
          map_type: string | null
          match_id: string
          step_number: number
          team_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          map_name: string
          map_type?: string | null
          match_id: string
          step_number: number
          team_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          map_name?: string
          map_type?: string | null
          match_id?: string
          step_number?: number
          team_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_map_vetos_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_map_vetos_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_map_vetos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_mvp_polls: {
        Row: {
          candidate_player_ids: string[]
          closed_at: string | null
          closes_at: string | null
          created_at: string
          discord_channel_id: string | null
          discord_message_id: string | null
          duration_hours: number
          id: string
          match_id: string
          posted_at: string | null
          tenant_id: string
          total_votes: number | null
          updated_at: string
          winner_battle_tag: string | null
          winner_imported_at: string | null
          winner_imported_by: string | null
          winner_member_id: string | null
          winner_source: string | null
          winner_votes: number | null
        }
        Insert: {
          candidate_player_ids?: string[]
          closed_at?: string | null
          closes_at?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          duration_hours?: number
          id?: string
          match_id: string
          posted_at?: string | null
          tenant_id: string
          total_votes?: number | null
          updated_at?: string
          winner_battle_tag?: string | null
          winner_imported_at?: string | null
          winner_imported_by?: string | null
          winner_member_id?: string | null
          winner_source?: string | null
          winner_votes?: number | null
        }
        Update: {
          candidate_player_ids?: string[]
          closed_at?: string | null
          closes_at?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          duration_hours?: number
          id?: string
          match_id?: string
          posted_at?: string | null
          tenant_id?: string
          total_votes?: number | null
          updated_at?: string
          winner_battle_tag?: string | null
          winner_imported_at?: string | null
          winner_imported_by?: string | null
          winner_member_id?: string | null
          winner_source?: string | null
          winner_votes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_mvp_polls_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_mvp_polls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_mvp_polls_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      match_mvp_votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          member_id: string
          source: string
          tenant_id: string
          updated_at: string
          voter_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          member_id: string
          source: string
          tenant_id: string
          updated_at?: string
          voter_key: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          member_id?: string
          source?: string
          tenant_id?: string
          updated_at?: string
          voter_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_mvp_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_mvp_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_mvp_votes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          battle_tag: string | null
          created_at: string
          id: string
          is_substitute: boolean
          match_id: string
          role: string | null
          team_id: string
          tenant_id: string
          tournament_id: string | null
          user_id: string | null
        }
        Insert: {
          battle_tag?: string | null
          created_at?: string
          id?: string
          is_substitute?: boolean
          match_id: string
          role?: string | null
          team_id: string
          tenant_id: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          battle_tag?: string | null
          created_at?: string
          id?: string
          is_substitute?: boolean
          match_id?: string
          role?: string | null
          team_id?: string
          tenant_id?: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_prediction_settings: {
        Row: {
          show_in_leaderboard: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          show_in_leaderboard?: boolean
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          show_in_leaderboard?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_prediction_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_predictions: {
        Row: {
          created_at: string
          id: string
          match_id: string
          predicted_winner_team_id: string
          result: string | null
          settled_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          predicted_winner_team_id: string
          result?: string | null
          settled_at?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          predicted_winner_team_id?: string
          result?: string | null
          settled_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_predictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_public_mvp_polls: {
        Row: {
          candidate_member_ids: string[] | null
          closed_at: string | null
          closes_at: string | null
          created_at: string
          discord_channel_id: string | null
          discord_message_id: string | null
          id: string
          match_id: string
          opened_at: string | null
          settled_at: string | null
          tenant_id: string
          total_votes: number | null
          updated_at: string
          winner_battle_tag: string | null
          winner_member_id: string | null
          winner_votes: number | null
        }
        Insert: {
          candidate_member_ids?: string[] | null
          closed_at?: string | null
          closes_at?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          match_id: string
          opened_at?: string | null
          settled_at?: string | null
          tenant_id: string
          total_votes?: number | null
          updated_at?: string
          winner_battle_tag?: string | null
          winner_member_id?: string | null
          winner_votes?: number | null
        }
        Update: {
          candidate_member_ids?: string[] | null
          closed_at?: string | null
          closes_at?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          match_id?: string
          opened_at?: string | null
          settled_at?: string | null
          tenant_id?: string
          total_votes?: number | null
          updated_at?: string
          winner_battle_tag?: string | null
          winner_member_id?: string | null
          winner_votes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_public_mvp_polls_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_public_mvp_polls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_public_mvp_polls_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      match_public_mvp_votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          member_id: string
          source: string
          tenant_id: string
          updated_at: string
          voter_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          member_id: string
          source: string
          tenant_id: string
          updated_at?: string
          voter_key: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          member_id?: string
          source?: string
          tenant_id?: string
          updated_at?: string
          voter_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_public_mvp_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_public_mvp_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_public_mvp_votes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_score_reports: {
        Row: {
          discord_user_id: string | null
          id: string
          match_id: string
          reported_at: string
          reported_by_auth_user_id: string
          team_side: number
          team1_score: number
          team2_score: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          discord_user_id?: string | null
          id?: string
          match_id: string
          reported_at?: string
          reported_by_auth_user_id: string
          team_side: number
          team1_score: number
          team2_score: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          discord_user_id?: string | null
          id?: string
          match_id?: string
          reported_at?: string
          reported_by_auth_user_id?: string
          team_side?: number
          team1_score?: number
          team2_score?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_score_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_score_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          best_of: number | null
          bracket_side: string | null
          bracket_slot: number | null
          checkin_email_sent_at: string | null
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          discord_dispute_thread_id: string | null
          discord_match_channel_id: string | null
          discord_scheduled_event_id: string | null
          discord_thread_id: string | null
          dispute_opened_at: string | null
          dispute_opened_by: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
          dispute_resolved_by: string | null
          escalation_pinged_at: string | null
          forfeit_processed_at: string | null
          forfeit_team_id: string | null
          group_key: string | null
          id: string
          is_bye: boolean | null
          lobby_code: string | null
          match_format: string | null
          next_match_lose_id: string | null
          next_match_lose_slot: number | null
          next_match_win_id: string | null
          next_match_win_slot: number | null
          no_show_reason: string | null
          notes: string | null
          parent_match_lose_id: string | null
          parent_match_win_id: string | null
          reminder_15_sent_at: string | null
          reminder_30_sent_at: string | null
          replay_url: string | null
          round_name: string | null
          round_number: number | null
          scheduled_at: string | null
          scrim_id: string | null
          stage_id: string | null
          started_at: string | null
          status: string
          stream_url: string | null
          team1_captain_dm_30_sent_at: string | null
          team1_checked_in_at: string | null
          team1_checkin_token: string | null
          team1_id: string | null
          team1_lineup_dm_sent_at: string | null
          team1_lineup_reminder_sent_at: string | null
          team1_score: number | null
          team2_captain_dm_30_sent_at: string | null
          team2_checked_in_at: string | null
          team2_checkin_token: string | null
          team2_id: string | null
          team2_lineup_dm_sent_at: string | null
          team2_lineup_reminder_sent_at: string | null
          team2_score: number | null
          tenant_id: string
          tournament_id: string | null
          updated_at: string | null
          veto_locked_at: string | null
          winner_team_id: string | null
        }
        Insert: {
          best_of?: number | null
          bracket_side?: string | null
          bracket_slot?: number | null
          checkin_email_sent_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          discord_dispute_thread_id?: string | null
          discord_match_channel_id?: string | null
          discord_scheduled_event_id?: string | null
          discord_thread_id?: string | null
          dispute_opened_at?: string | null
          dispute_opened_by?: string | null
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolved_at?: string | null
          dispute_resolved_by?: string | null
          escalation_pinged_at?: string | null
          forfeit_processed_at?: string | null
          forfeit_team_id?: string | null
          group_key?: string | null
          id?: string
          is_bye?: boolean | null
          lobby_code?: string | null
          match_format?: string | null
          next_match_lose_id?: string | null
          next_match_lose_slot?: number | null
          next_match_win_id?: string | null
          next_match_win_slot?: number | null
          no_show_reason?: string | null
          notes?: string | null
          parent_match_lose_id?: string | null
          parent_match_win_id?: string | null
          reminder_15_sent_at?: string | null
          reminder_30_sent_at?: string | null
          replay_url?: string | null
          round_name?: string | null
          round_number?: number | null
          scheduled_at?: string | null
          scrim_id?: string | null
          stage_id?: string | null
          started_at?: string | null
          status?: string
          stream_url?: string | null
          team1_captain_dm_30_sent_at?: string | null
          team1_checked_in_at?: string | null
          team1_checkin_token?: string | null
          team1_id?: string | null
          team1_lineup_dm_sent_at?: string | null
          team1_lineup_reminder_sent_at?: string | null
          team1_score?: number | null
          team2_captain_dm_30_sent_at?: string | null
          team2_checked_in_at?: string | null
          team2_checkin_token?: string | null
          team2_id?: string | null
          team2_lineup_dm_sent_at?: string | null
          team2_lineup_reminder_sent_at?: string | null
          team2_score?: number | null
          tenant_id: string
          tournament_id?: string | null
          updated_at?: string | null
          veto_locked_at?: string | null
          winner_team_id?: string | null
        }
        Update: {
          best_of?: number | null
          bracket_side?: string | null
          bracket_slot?: number | null
          checkin_email_sent_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          discord_dispute_thread_id?: string | null
          discord_match_channel_id?: string | null
          discord_scheduled_event_id?: string | null
          discord_thread_id?: string | null
          dispute_opened_at?: string | null
          dispute_opened_by?: string | null
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolved_at?: string | null
          dispute_resolved_by?: string | null
          escalation_pinged_at?: string | null
          forfeit_processed_at?: string | null
          forfeit_team_id?: string | null
          group_key?: string | null
          id?: string
          is_bye?: boolean | null
          lobby_code?: string | null
          match_format?: string | null
          next_match_lose_id?: string | null
          next_match_lose_slot?: number | null
          next_match_win_id?: string | null
          next_match_win_slot?: number | null
          no_show_reason?: string | null
          notes?: string | null
          parent_match_lose_id?: string | null
          parent_match_win_id?: string | null
          reminder_15_sent_at?: string | null
          reminder_30_sent_at?: string | null
          replay_url?: string | null
          round_name?: string | null
          round_number?: number | null
          scheduled_at?: string | null
          scrim_id?: string | null
          stage_id?: string | null
          started_at?: string | null
          status?: string
          stream_url?: string | null
          team1_captain_dm_30_sent_at?: string | null
          team1_checked_in_at?: string | null
          team1_checkin_token?: string | null
          team1_id?: string | null
          team1_lineup_dm_sent_at?: string | null
          team1_lineup_reminder_sent_at?: string | null
          team1_score?: number | null
          team2_captain_dm_30_sent_at?: string | null
          team2_checked_in_at?: string | null
          team2_checkin_token?: string | null
          team2_id?: string | null
          team2_lineup_dm_sent_at?: string | null
          team2_lineup_reminder_sent_at?: string | null
          team2_score?: number | null
          tenant_id?: string
          tournament_id?: string | null
          updated_at?: string | null
          veto_locked_at?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_forfeit_team_id_fkey"
            columns: ["forfeit_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_lose_fk"
            columns: ["next_match_lose_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_win_fk"
            columns: ["next_match_win_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_parent_lose_fk"
            columns: ["parent_match_lose_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_parent_win_fk"
            columns: ["parent_match_win_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_scrim_id_fkey"
            columns: ["scrim_id"]
            isOneToOne: false
            referencedRelation: "scrims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_stage_fk"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_fk"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_fk"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_fk"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_fk"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          author_id: string | null
          comments_closed: boolean
          content: string
          created_at: string
          deleted_at: string | null
          excerpt: string | null
          id: string
          image_url: string | null
          published_at: string | null
          slug: string
          status: string
          tag: string
          team_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          comments_closed?: boolean
          content: string
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          slug: string
          status?: string
          tag?: string
          team_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          comments_closed?: boolean
          content?: string
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          tag?: string
          team_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      news_comments: {
        Row: {
          author_name: string | null
          content: string
          created_at: string
          id: string
          news_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          author_name?: string | null
          content: string
          created_at?: string
          id?: string
          news_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          author_name?: string | null
          content?: string
          created_at?: string
          id?: string
          news_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_comments_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          confirm_token: string | null
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          source: string | null
          status: string
          tenant_id: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          confirm_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          source?: string | null
          status?: string
          tenant_id: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          confirm_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          status?: string
          tenant_id?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          channel: string
          enabled: boolean
          event_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          enabled?: boolean
          event_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          event_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      overlay_heartbeats: {
        Row: {
          last_seen_at: string
          source: string
          tenant_id: string
        }
        Insert: {
          last_seen_at?: string
          source: string
          tenant_id: string
        }
        Update: {
          last_seen_at?: string
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_heartbeats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          category: string
          created_at: string | null
          deleted_at: string | null
          description: string
          display_order: number | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          note: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          deleted_at?: string | null
          description: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          note?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          note?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      partnership_requests: {
        Row: {
          admin_notes: string | null
          budget_range: string | null
          category: string
          company_name: string
          contact_name: string
          contacted_at: string | null
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          message: string
          phone: string | null
          read_at: string | null
          status: string | null
          updated_at: string | null
          user_agent: string | null
          website: string | null
        }
        Insert: {
          admin_notes?: string | null
          budget_range?: string | null
          category: string
          company_name: string
          contact_name: string
          contacted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          message: string
          phone?: string | null
          read_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_agent?: string | null
          website?: string | null
        }
        Update: {
          admin_notes?: string | null
          budget_range?: string | null
          category?: string
          company_name?: string
          contact_name?: string
          contacted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          message?: string
          phone?: string | null
          read_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_agent?: string | null
          website?: string | null
        }
        Relationships: []
      }
      patch_notes: {
        Row: {
          created_at: string | null
          date: string
          date_parsed: string | null
          heroes: Json | null
          id: string
          link: string
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          date_parsed?: string | null
          heroes?: Json | null
          id: string
          link: string
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          date_parsed?: string | null
          heroes?: Json | null
          id?: string
          link?: string
          summary?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pending_guild_links: {
        Row: {
          guild_id: string
          guild_name: string | null
          owner_discord_id: string | null
          requested_at: string
        }
        Insert: {
          guild_id: string
          guild_name?: string | null
          owner_discord_id?: string | null
          requested_at?: string
        }
        Update: {
          guild_id?: string
          guild_name?: string | null
          owner_discord_id?: string | null
          requested_at?: string
        }
        Relationships: []
      }
      plan_cgv_acceptances: {
        Row: {
          accepted_at: string
          amount_cents: number
          cgv_accepted: boolean
          cgv_version: string
          checkout_intent_id: number | null
          id: string
          immediate_execution_waiver: boolean
          plan: string
          staff_id: string
          tenant_id: string
          term: string
        }
        Insert: {
          accepted_at?: string
          amount_cents: number
          cgv_accepted?: boolean
          cgv_version: string
          checkout_intent_id?: number | null
          id?: string
          immediate_execution_waiver?: boolean
          plan: string
          staff_id: string
          tenant_id: string
          term: string
        }
        Update: {
          accepted_at?: string
          amount_cents?: number
          cgv_accepted?: boolean
          cgv_version?: string
          checkout_intent_id?: number | null
          id?: string
          immediate_execution_waiver?: boolean
          plan?: string
          staff_id?: string
          tenant_id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_cgv_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      player_action_snoozes: {
        Row: {
          action_key: string
          created_at: string
          discord_user_id: string
          snoozed_until: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_key: string
          created_at?: string
          discord_user_id: string
          snoozed_until: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          created_at?: string
          discord_user_id?: string
          snoozed_until?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_action_snoozes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      player_blacklist: {
        Row: {
          active: boolean
          banned_by: string | null
          battle_tag: string | null
          created_at: string
          discord_user_id: string | null
          display_name: string | null
          expires_at: string | null
          id: string
          notes: string | null
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          banned_by?: string | null
          battle_tag?: string | null
          created_at?: string
          discord_user_id?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          banned_by?: string | null
          battle_tag?: string | null
          created_at?: string
          discord_user_id?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      player_calendar_tokens: {
        Row: {
          auth_user_id: string
          created_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id: string
          token: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: []
      }
      player_discovery_profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          discoverable: boolean
          display_name: string | null
          opted_in_at: string | null
          show_ratings: boolean
          show_teams: boolean
          tagline: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          discoverable?: boolean
          display_name?: string | null
          opted_in_at?: string | null
          show_ratings?: boolean
          show_teams?: boolean
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          discoverable?: boolean
          display_name?: string | null
          opted_in_at?: string | null
          show_ratings?: boolean
          show_teams?: boolean
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      player_follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      player_hero_preferences: {
        Row: {
          auth_user_id: string
          bans: string[]
          created_at: string
          picks: string[]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          bans?: string[]
          created_at?: string
          picks?: string[]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          bans?: string[]
          created_at?: string
          picks?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      player_rating_history: {
        Row: {
          created_at: string
          id: string
          match_id: string
          occurred_at: string
          opponent_avg_rating: number | null
          rating_after: number
          rating_before: number
          rd_after: number
          rd_before: number
          result: string
          tenant_id: string
          tournament_id: string | null
          user_id: string
          volatility_after: number
          volatility_before: number
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          occurred_at: string
          opponent_avg_rating?: number | null
          rating_after: number
          rating_before: number
          rd_after: number
          rd_before: number
          result: string
          tenant_id: string
          tournament_id?: string | null
          user_id: string
          volatility_after: number
          volatility_before: number
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          occurred_at?: string
          opponent_avg_rating?: number | null
          rating_after?: number
          rating_before?: number
          rd_after?: number
          rd_before?: number
          result?: string
          tenant_id?: string
          tournament_id?: string | null
          user_id?: string
          volatility_after?: number
          volatility_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_rating_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rating_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rating_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          avatar_url: string | null
          battle_tag: string | null
          created_at: string
          display_name: string | null
          draws: number
          games_played: number
          id: string
          last_match_at: string | null
          losses: number
          peak_rating: number
          rating: number
          rd: number
          tenant_id: string
          updated_at: string
          user_id: string
          volatility: number
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          battle_tag?: string | null
          created_at?: string
          display_name?: string | null
          draws?: number
          games_played?: number
          id?: string
          last_match_at?: string | null
          losses?: number
          peak_rating?: number
          rating?: number
          rd?: number
          tenant_id: string
          updated_at?: string
          user_id: string
          volatility?: number
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          battle_tag?: string | null
          created_at?: string
          display_name?: string | null
          draws?: number
          games_played?: number
          id?: string
          last_match_at?: string | null
          losses?: number
          peak_rating?: number
          rating?: number
          rd?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          volatility?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_ratings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_pool_checkouts: {
        Row: {
          amount_cents: number
          checkout_intent_id: string
          contributor_email: string | null
          contributor_name: string | null
          created_at: string
          id: string
          is_anonymous: boolean
          message: string | null
          prize_pool_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          checkout_intent_id: string
          contributor_email?: string | null
          contributor_name?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          message?: string | null
          prize_pool_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          checkout_intent_id?: string
          contributor_email?: string | null
          contributor_name?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          message?: string | null
          prize_pool_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_pool_checkouts_prize_pool_id_fkey"
            columns: ["prize_pool_id"]
            isOneToOne: false
            referencedRelation: "tournament_prize_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_pool_checkouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_pool_contributions: {
        Row: {
          amount_cents: number
          checkout_intent_id: string | null
          contributor_name: string | null
          created_at: string
          helloasso_payment_id: string
          id: string
          is_anonymous: boolean
          message: string | null
          prize_pool_id: string
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          checkout_intent_id?: string | null
          contributor_name?: string | null
          created_at?: string
          helloasso_payment_id: string
          id?: string
          is_anonymous?: boolean
          message?: string | null
          prize_pool_id: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          checkout_intent_id?: string | null
          contributor_name?: string | null
          created_at?: string
          helloasso_payment_id?: string
          id?: string
          is_anonymous?: boolean
          message?: string | null
          prize_pool_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_pool_contributions_prize_pool_id_fkey"
            columns: ["prize_pool_id"]
            isOneToOne: false
            referencedRelation: "tournament_prize_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_pool_contributions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_mvp_overlay_settings: {
        Row: {
          demo_started_at: string | null
          demo_until: string | null
          position: string
          show_sources: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
          window_minutes: number
        }
        Insert: {
          demo_started_at?: string | null
          demo_until?: string | null
          position?: string
          show_sources?: boolean
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          window_minutes?: number
        }
        Update: {
          demo_started_at?: string | null
          demo_until?: string | null
          position?: string
          show_sources?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_mvp_overlay_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      regie_overlay_layouts: {
        Row: {
          layout: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          layout?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          layout?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regie_overlay_layouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scrim_planning_availabilities: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          party: string
          planning_id: string
          slots: Json
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          party: string
          planning_id: string
          slots?: Json
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          party?: string
          planning_id?: string
          slots?: Json
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrim_planning_availabilities_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "scrim_plannings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_planning_availabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scrim_plannings: {
        Row: {
          created_at: string
          created_by: string | null
          day_end_min: number
          day_start_min: number
          deleted_at: string | null
          game: string | null
          horizon_days: number
          horizon_start: string
          id: string
          is_public: boolean
          reminder_pinged_at: string | null
          scrim_id: string | null
          slot_minutes: number
          source_demande_id: string | null
          staff_required: boolean
          status: string
          team1_id: string
          team2_id: string
          tenant_id: string
          timezone: string
          title: string | null
          updated_at: string
          validated_slot: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_end_min?: number
          day_start_min?: number
          deleted_at?: string | null
          game?: string | null
          horizon_days?: number
          horizon_start: string
          id?: string
          is_public?: boolean
          reminder_pinged_at?: string | null
          scrim_id?: string | null
          slot_minutes?: number
          source_demande_id?: string | null
          staff_required?: boolean
          status?: string
          team1_id: string
          team2_id: string
          tenant_id: string
          timezone?: string
          title?: string | null
          updated_at?: string
          validated_slot?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_end_min?: number
          day_start_min?: number
          deleted_at?: string | null
          game?: string | null
          horizon_days?: number
          horizon_start?: string
          id?: string
          is_public?: boolean
          reminder_pinged_at?: string | null
          scrim_id?: string | null
          slot_minutes?: number
          source_demande_id?: string | null
          staff_required?: boolean
          status?: string
          team1_id?: string
          team2_id?: string
          tenant_id?: string
          timezone?: string
          title?: string | null
          updated_at?: string
          validated_slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrim_plannings_scrim_id_fkey"
            columns: ["scrim_id"]
            isOneToOne: false
            referencedRelation: "scrims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_plannings_source_demande_id_fkey"
            columns: ["source_demande_id"]
            isOneToOne: false
            referencedRelation: "demandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_plannings_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_plannings_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_plannings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scrim_score_reports: {
        Row: {
          id: string
          reported_at: string
          reported_by_auth_user_id: string
          scrim_id: string
          team_side: number
          team1_score: number
          team2_score: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          reported_at?: string
          reported_by_auth_user_id: string
          scrim_id: string
          team_side: number
          team1_score: number
          team2_score: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          reported_at?: string
          reported_by_auth_user_id?: string
          scrim_id?: string
          team_side?: number
          team1_score?: number
          team2_score?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrim_score_reports_scrim_id_fkey"
            columns: ["scrim_id"]
            isOneToOne: false
            referencedRelation: "scrims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_score_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scrim_searches: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          format: string | null
          id: string
          note: string | null
          slots: Json
          status: string
          team_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          format?: string | null
          id?: string
          note?: string | null
          slots?: Json
          status?: string
          team_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          format?: string | null
          id?: string
          note?: string | null
          slots?: Json
          status?: string
          team_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrim_searches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrim_searches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scrims: {
        Row: {
          banner_url: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          discord_thread_id: string | null
          dispute_reason: string | null
          duration_minutes: number | null
          game: string | null
          id: string
          is_public: boolean
          logo_url: string | null
          name: string
          ranked: boolean
          scheduled_date: string | null
          settings: Json | null
          slug: string | null
          source_demande_id: string | null
          source_planning_id: string | null
          status: string
          stream_url: string | null
          team1_id: string | null
          team1_score: number | null
          team2_id: string | null
          team2_score: number | null
          tenant_id: string
          timezone: string | null
          updated_at: string | null
          winner_team_id: string | null
        }
        Insert: {
          banner_url?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discord_thread_id?: string | null
          dispute_reason?: string | null
          duration_minutes?: number | null
          game?: string | null
          id?: string
          is_public?: boolean
          logo_url?: string | null
          name: string
          ranked?: boolean
          scheduled_date?: string | null
          settings?: Json | null
          slug?: string | null
          source_demande_id?: string | null
          source_planning_id?: string | null
          status?: string
          stream_url?: string | null
          team1_id?: string | null
          team1_score?: number | null
          team2_id?: string | null
          team2_score?: number | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string | null
          winner_team_id?: string | null
        }
        Update: {
          banner_url?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discord_thread_id?: string | null
          dispute_reason?: string | null
          duration_minutes?: number | null
          game?: string | null
          id?: string
          is_public?: boolean
          logo_url?: string | null
          name?: string
          ranked?: boolean
          scheduled_date?: string | null
          settings?: Json | null
          slug?: string | null
          source_demande_id?: string | null
          source_planning_id?: string | null
          status?: string
          stream_url?: string | null
          team1_id?: string | null
          team1_score?: number | null
          team2_id?: string | null
          team2_score?: number | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrims_source_demande_id_fkey"
            columns: ["source_demande_id"]
            isOneToOne: false
            referencedRelation: "demandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrims_source_planning_id_fkey"
            columns: ["source_planning_id"]
            isOneToOne: false
            referencedRelation: "scrim_plannings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrims_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrims_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrims_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token_encrypted: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string
          external_account_id: string | null
          handle: string | null
          id: string
          last_error: string | null
          platform: string
          refresh_token_encrypted: string | null
          refresh_token_expires_at: string | null
          scopes: string[]
          status: string
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          external_account_id?: string | null
          handle?: string | null
          id?: string
          last_error?: string | null
          platform: string
          refresh_token_encrypted?: string | null
          refresh_token_expires_at?: string | null
          scopes?: string[]
          status?: string
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          external_account_id?: string | null
          handle?: string | null
          id?: string
          last_error?: string | null
          platform?: string
          refresh_token_encrypted?: string | null
          refresh_token_expires_at?: string | null
          scopes?: string[]
          status?: string
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      social_feed_items: {
        Row: {
          created_at: string
          external_id: string
          id: string
          published_at: string
          source: string
          tenant_id: string
          text: string
          thumbnail_url: string | null
          url: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          published_at: string
          source: string
          tenant_id: string
          text?: string
          thumbnail_url?: string | null
          url: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          published_at?: string
          source?: string
          tenant_id?: string
          text?: string
          thumbnail_url?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_feed_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_targets: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          external_id: string | null
          hashtags: string[]
          id: string
          image_override: string | null
          permalink: string | null
          platform: string
          post_id: string
          sent_at: string | null
          status: string
          text_override: string | null
          title_override: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          external_id?: string | null
          hashtags?: string[]
          id?: string
          image_override?: string | null
          permalink?: string | null
          platform: string
          post_id: string
          sent_at?: string | null
          status?: string
          text_override?: string | null
          title_override?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          external_id?: string | null
          hashtags?: string[]
          id?: string
          image_override?: string | null
          permalink?: string | null
          platform?: string
          post_id?: string
          sent_at?: string | null
          status?: string
          text_override?: string | null
          title_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          base_image_url: string | null
          base_text: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_image_url?: string | null
          base_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_image_url?: string | null
          base_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          display_name: string | null
          email: string
          extra_permissions: string[]
          id: string
          is_active: boolean
          is_pole_admin: boolean
          role: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          email: string
          extra_permissions?: string[]
          id?: string
          is_active?: boolean
          is_pole_admin?: boolean
          role?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          email?: string
          extra_permissions?: string[]
          id?: string
          is_active?: boolean
          is_pole_admin?: boolean
          role?: string
        }
        Relationships: []
      }
      staff_logs: {
        Row: {
          action: string | null
          changes: Json | null
          created_at: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json | null
          staff_id: string | null
          staff_name: string | null
          staff_role: string | null
          tenant_id: string
          tournament_id: string | null
        }
        Insert: {
          action?: string | null
          changes?: Json | null
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
          staff_id?: string | null
          staff_name?: string | null
          staff_role?: string | null
          tenant_id: string
          tournament_id?: string | null
        }
        Update: {
          action?: string | null
          changes?: Json | null
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
          staff_id?: string | null
          staff_name?: string | null
          staff_role?: string | null
          tenant_id?: string
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_staff_logs_staff"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_staff_logs_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_planning_slots: {
        Row: {
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          note: string | null
          person_name: string
          role: string | null
          slot_date: string
          source: string
          start_time: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          note?: string | null
          person_name: string
          role?: string | null
          slot_date: string
          source?: string
          start_time: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          note?: string | null
          person_name?: string
          role?: string | null
          slot_date?: string
          source?: string
          start_time?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_planning_slots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_teams: {
        Row: {
          created_at: string
          is_substitute: boolean
          notes: string | null
          seed: number | null
          stage_id: string
          team_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          is_substitute?: boolean
          notes?: string | null
          seed?: number | null
          stage_id: string
          team_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          is_substitute?: boolean
          notes?: string | null
          seed?: number | null
          stage_id?: string
          team_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_teams_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_tiebreaker_overrides: {
        Row: {
          id: number
          loser_team_id: string
          reason: string | null
          set_at: string
          set_by_staff_id: string | null
          stage_id: string
          tenant_id: string
          winner_team_id: string
        }
        Insert: {
          id?: number
          loser_team_id: string
          reason?: string | null
          set_at?: string
          set_by_staff_id?: string | null
          stage_id: string
          tenant_id: string
          winner_team_id: string
        }
        Update: {
          id?: number
          loser_team_id?: string
          reason?: string | null
          set_at?: string
          set_by_staff_id?: string | null
          stage_id?: string
          tenant_id?: string
          winner_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_tiebreaker_overrides_loser_team_id_fkey"
            columns: ["loser_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_tiebreaker_overrides_set_by_staff_id_fkey"
            columns: ["set_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_tiebreaker_overrides_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_tiebreaker_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_tiebreaker_overrides_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_alert_events: {
        Row: {
          actor_name: string | null
          amount: number | null
          created_at: string
          id: string
          kind: string
          tenant_id: string
          tier: string | null
          twitch_message_id: string
        }
        Insert: {
          actor_name?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          kind: string
          tenant_id: string
          tier?: string | null
          twitch_message_id: string
        }
        Update: {
          actor_name?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          kind?: string
          tenant_id?: string
          tier?: string | null
          twitch_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_alert_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_alert_rules: {
        Row: {
          enabled: boolean
          kind: string
          message: string | null
          min_amount: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          kind: string
          message?: string | null
          min_amount?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          kind?: string
          message?: string | null
          min_amount?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_alert_settings: {
        Row: {
          accent_color: string | null
          duration_ms: number | null
          enabled: boolean
          frame_kind: string | null
          frame_path: string | null
          sound_path: string | null
          sound_url: string | null
          sound_volume: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_color?: string | null
          duration_ms?: number | null
          enabled?: boolean
          frame_kind?: string | null
          frame_path?: string | null
          sound_path?: string | null
          sound_url?: string | null
          sound_volume?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_color?: string | null
          duration_ms?: number | null
          enabled?: boolean
          frame_kind?: string | null
          frame_path?: string | null
          sound_path?: string | null
          sound_url?: string | null
          sound_volume?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_alert_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_at: string | null
          assigned_staff_id: string | null
          category: string
          converted_entity_blacklist_id: string | null
          converted_player_blacklist_id: string | null
          created_at: string
          discord_message_id: string | null
          discord_user_id: string | null
          discord_username: string | null
          id: string
          is_anonymous: boolean
          message: string
          reported_battle_tag: string | null
          reported_target_name: string | null
          reported_target_type: string | null
          reporter_email: string | null
          reporter_name: string | null
          reporter_user_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
          status: string
          subject: string | null
          tenant_id: string
          tournament_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_staff_id?: string | null
          category: string
          converted_entity_blacklist_id?: string | null
          converted_player_blacklist_id?: string | null
          created_at?: string
          discord_message_id?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          id?: string
          is_anonymous?: boolean
          message: string
          reported_battle_tag?: string | null
          reported_target_name?: string | null
          reported_target_type?: string | null
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_user_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          source?: string
          status?: string
          subject?: string | null
          tenant_id: string
          tournament_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_staff_id?: string | null
          category?: string
          converted_entity_blacklist_id?: string | null
          converted_player_blacklist_id?: string | null
          created_at?: string
          discord_message_id?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          id?: string
          is_anonymous?: boolean
          message?: string
          reported_battle_tag?: string | null
          reported_target_name?: string | null
          reported_target_type?: string | null
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_user_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          status?: string
          subject?: string | null
          tenant_id?: string
          tournament_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_converted_entity_blacklist_id_fkey"
            columns: ["converted_entity_blacklist_id"]
            isOneToOne: false
            referencedRelation: "entity_blacklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_converted_player_blacklist_id_fkey"
            columns: ["converted_player_blacklist_id"]
            isOneToOne: false
            referencedRelation: "player_blacklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_boards: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_boards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          label: string
          position: number
          task_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          label: string
          position?: number
          task_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          label?: string
          position?: number
          task_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_columns: {
        Row: {
          board_id: string
          created_at: string
          id: string
          is_done: boolean
          name: string
          position: number
          tenant_id: string
          updated_at: string
          wip_limit: number | null
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          is_done?: boolean
          name: string
          position: number
          tenant_id: string
          updated_at?: string
          wip_limit?: number | null
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          is_done?: boolean
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_columns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_staff_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_staff_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_staff_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          board_id: string
          color: string
          created_at: string
          id: string
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          board_id: string
          color: string
          created_at?: string
          id?: string
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          board_id?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_staff_id: string | null
          board_id: string
          column_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          labels: string[]
          position: number
          priority: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_staff_id?: string | null
          board_id: string
          column_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          labels?: string[]
          position?: number
          priority?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_staff_id?: string | null
          board_id?: string
          column_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          labels?: string[]
          position?: number
          priority?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_staff_id_fkey"
            columns: ["assignee_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "task_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_fanart_cards: {
        Row: {
          artist_name: string
          artist_url: string | null
          category: string
          created_at: string
          id: string
          image_path: string
          licence_accepted_at: string
          rarity: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_ref: string | null
          status: string
          submitted_by: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          artist_name: string
          artist_url?: string | null
          category?: string
          created_at?: string
          id?: string
          image_path: string
          licence_accepted_at: string
          rarity?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ref?: string | null
          status?: string
          submitted_by?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          artist_name?: string
          artist_url?: string | null
          category?: string
          created_at?: string
          id?: string
          image_path?: string
          licence_accepted_at?: string
          rarity?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ref?: string | null
          status?: string
          submitted_by?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_fanart_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_overlay_themes: {
        Row: {
          accent_color: string | null
          drop_line: string | null
          media_kind: string | null
          media_path: string | null
          position: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          win_line: string | null
        }
        Insert: {
          accent_color?: string | null
          drop_line?: string | null
          media_kind?: string | null
          media_path?: string | null
          position?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          win_line?: string | null
        }
        Update: {
          accent_color?: string | null
          drop_line?: string | null
          media_kind?: string | null
          media_path?: string | null
          position?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          win_line?: string | null
        }
        Relationships: []
      }
      tcg_overlay_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          revoked_at: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: []
      }
      tcg_pack_cards: {
        Row: {
          card_fanart_id: string | null
          card_map_slug: string | null
          card_mascot_slug: string | null
          card_team_id: string | null
          card_user_id: string | null
          is_foil: boolean
          pack_id: string
          position: number
          rarity: string
          recycled_at: string | null
          subject_kind: string
        }
        Insert: {
          card_fanart_id?: string | null
          card_map_slug?: string | null
          card_mascot_slug?: string | null
          card_team_id?: string | null
          card_user_id?: string | null
          is_foil?: boolean
          pack_id: string
          position: number
          rarity: string
          recycled_at?: string | null
          subject_kind: string
        }
        Update: {
          card_fanart_id?: string | null
          card_map_slug?: string | null
          card_mascot_slug?: string | null
          card_team_id?: string | null
          card_user_id?: string | null
          is_foil?: boolean
          pack_id?: string
          position?: number
          rarity?: string
          recycled_at?: string | null
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_pack_cards_card_fanart_id_fkey"
            columns: ["card_fanart_id"]
            isOneToOne: false
            referencedRelation: "tcg_fanart_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_pack_cards_card_team_id_fkey"
            columns: ["card_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_pack_cards_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "tcg_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_packs: {
        Row: {
          granted_at: string
          guaranteed_fanart_id: string | null
          id: string
          opened_at: string | null
          source_kind: string
          source_match_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          guaranteed_fanart_id?: string | null
          id?: string
          opened_at?: string | null
          source_kind?: string
          source_match_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          guaranteed_fanart_id?: string | null
          id?: string
          opened_at?: string | null
          source_kind?: string
          source_match_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_packs_guaranteed_fanart_id_fkey"
            columns: ["guaranteed_fanart_id"]
            isOneToOne: false
            referencedRelation: "tcg_fanart_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_packs_source_match_id_fkey"
            columns: ["source_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_packs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_photo_purges: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          reason: string
          storage_path: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          reason: string
          storage_path: string
          tenant_id: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          reason?: string
          storage_path?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tcg_player_cards: {
        Row: {
          created_at: string
          excluded_at: string | null
          opted_in_at: string | null
          photo_path: string | null
          photo_rejected_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_status: string
          revoked_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          excluded_at?: string | null
          opted_in_at?: string | null
          photo_path?: string | null
          photo_rejected_reason?: string | null
          photo_reviewed_at?: string | null
          photo_reviewed_by?: string | null
          photo_status?: string
          revoked_at?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          excluded_at?: string | null
          opted_in_at?: string | null
          photo_path?: string | null
          photo_rejected_reason?: string | null
          photo_reviewed_at?: string | null
          photo_reviewed_by?: string | null
          photo_status?: string
          revoked_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_player_cards_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_player_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_showcases: {
        Row: {
          background: string | null
          created_at: string
          enabled: boolean
          frame: string | null
          subject_keys: string[]
          tenant_id: string
          unlocked_cosmetics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          background?: string | null
          created_at?: string
          enabled?: boolean
          frame?: string | null
          subject_keys?: string[]
          tenant_id: string
          unlocked_cosmetics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          background?: string | null
          created_at?: string
          enabled?: boolean
          frame?: string | null
          subject_keys?: string[]
          tenant_id?: string
          unlocked_cosmetics?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_showcases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_trade_blocks: {
        Row: {
          blocked_user_id: string
          created_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_trade_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_trade_items: {
        Row: {
          card_fanart_id: string | null
          card_map_slug: string | null
          card_mascot_slug: string | null
          card_team_id: string | null
          card_user_id: string | null
          from_pack_id: string | null
          from_position: number | null
          is_foil: boolean | null
          ordinal: number
          rarity: string | null
          side: string
          subject_kind: string
          to_pack_id: string | null
          to_position: number | null
          trade_id: string
        }
        Insert: {
          card_fanart_id?: string | null
          card_map_slug?: string | null
          card_mascot_slug?: string | null
          card_team_id?: string | null
          card_user_id?: string | null
          from_pack_id?: string | null
          from_position?: number | null
          is_foil?: boolean | null
          ordinal: number
          rarity?: string | null
          side: string
          subject_kind: string
          to_pack_id?: string | null
          to_position?: number | null
          trade_id: string
        }
        Update: {
          card_fanart_id?: string | null
          card_map_slug?: string | null
          card_mascot_slug?: string | null
          card_team_id?: string | null
          card_user_id?: string | null
          from_pack_id?: string | null
          from_position?: number | null
          is_foil?: boolean | null
          ordinal?: number
          rarity?: string | null
          side?: string
          subject_kind?: string
          to_pack_id?: string | null
          to_position?: number | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_trade_items_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "tcg_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_trade_settings: {
        Row: {
          accepts_proposals: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepts_proposals?: boolean
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepts_proposals?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_trade_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_trades: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          proposer_id: string
          proposer_pack_id: string | null
          recipient_id: string
          recipient_pack_id: string | null
          resolution_reason: string | null
          resolved_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          proposer_id: string
          proposer_pack_id?: string | null
          recipient_id: string
          recipient_pack_id?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          proposer_id?: string
          proposer_pack_id?: string | null
          recipient_id?: string
          recipient_pack_id?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_trades_proposer_pack_id_fkey"
            columns: ["proposer_pack_id"]
            isOneToOne: false
            referencedRelation: "tcg_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_trades_recipient_pack_id_fkey"
            columns: ["recipient_pack_id"]
            isOneToOne: false
            referencedRelation: "tcg_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcg_trades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_wallet_entries: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          source_kind: string
          source_ref: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          source_kind: string
          source_ref: string
          tenant_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          source_kind?: string
          source_ref?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_wallet_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_wallets: {
        Row: {
          balance: number
          created_at: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_wallets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          payload: Json | null
          team_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payload?: Json | null
          team_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payload?: Json | null
          team_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_availability: {
        Row: {
          created_at: string
          id: string
          slots: Json
          team_id: string
          tenant_id: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          slots?: Json
          team_id: string
          tenant_id: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          slots?: Json
          team_id?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_availability_constraints: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          kind: string
          note: string | null
          starts_on: string | null
          team_id: string
          tenant_id: string
          time_of_day: string | null
          timezone: string
          tournament_id: string | null
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          kind: string
          note?: string | null
          starts_on?: string | null
          team_id: string
          tenant_id: string
          time_of_day?: string | null
          timezone?: string
          tournament_id?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          kind?: string
          note?: string | null
          starts_on?: string | null
          team_id?: string
          tenant_id?: string
          time_of_day?: string | null
          timezone?: string
          tournament_id?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_constraints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_constraints_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_constraints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_constraints_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_discord_channels: {
        Row: {
          access: Json
          captured_at: string
          role_exists: boolean
          role_id: string | null
          role_name: string | null
          team_id: string
          tenant_id: string
          text_channel_exists: boolean
          text_channel_id: string | null
          text_channel_name: string | null
          voice_channel_exists: boolean
          voice_channel_id: string | null
          voice_channel_name: string | null
          warnings: Json
        }
        Insert: {
          access?: Json
          captured_at?: string
          role_exists?: boolean
          role_id?: string | null
          role_name?: string | null
          team_id: string
          tenant_id: string
          text_channel_exists?: boolean
          text_channel_id?: string | null
          text_channel_name?: string | null
          voice_channel_exists?: boolean
          voice_channel_id?: string | null
          voice_channel_name?: string | null
          warnings?: Json
        }
        Update: {
          access?: Json
          captured_at?: string
          role_exists?: boolean
          role_id?: string | null
          role_name?: string | null
          team_id?: string
          tenant_id?: string
          text_channel_exists?: boolean
          text_channel_id?: string | null
          text_channel_name?: string | null
          voice_channel_exists?: boolean
          voice_channel_id?: string | null
          voice_channel_name?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "team_discord_channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_discord_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invite_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          max_uses: number | null
          revoked_at: string | null
          role: string
          team_id: string
          tenant_id: string
          token_hash: string
          uses_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          role?: string
          team_id: string
          tenant_id: string
          token_hash: string
          uses_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          role?: string
          team_id?: string
          tenant_id?: string
          token_hash?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_invite_links_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invite_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission: string
          revoked_at: string | null
          revoked_by: string | null
          team_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          revoked_at?: string | null
          revoked_by?: string | null
          team_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          revoked_at?: string | null
          revoked_by?: string | null
          team_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          avatar_url: string | null
          battle_tag: string | null
          battle_tag_verified_at: string | null
          created_at: string | null
          display_name: string | null
          id: string
          is_substitute: boolean
          pronouns: string | null
          role: string
          skill_rating: number | null
          specialty: string | null
          tagline: string | null
          team_id: string
          tenant_id: string
          twitch: string | null
          twitter: string | null
          user_id: string
          verified_battle_net_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          avatar_url?: string | null
          battle_tag?: string | null
          battle_tag_verified_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_substitute?: boolean
          pronouns?: string | null
          role?: string
          skill_rating?: number | null
          specialty?: string | null
          tagline?: string | null
          team_id: string
          tenant_id: string
          twitch?: string | null
          twitter?: string | null
          user_id: string
          verified_battle_net_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          avatar_url?: string | null
          battle_tag?: string | null
          battle_tag_verified_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_substitute?: boolean
          pronouns?: string | null
          role?: string
          skill_rating?: number | null
          specialty?: string | null
          tagline?: string | null
          team_id?: string
          tenant_id?: string
          twitch?: string | null
          twitter?: string | null
          user_id?: string
          verified_battle_net_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_openings: {
        Row: {
          availability: string | null
          contact_discord: string | null
          contact_email: string | null
          expires_at: string | null
          id: string
          level: string | null
          marked_at: string
          note: string | null
          roles: string[]
          source: string
          team_id: string | null
          team_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          availability?: string | null
          contact_discord?: string | null
          contact_email?: string | null
          expires_at?: string | null
          id?: string
          level?: string | null
          marked_at?: string
          note?: string | null
          roles?: string[]
          source?: string
          team_id?: string | null
          team_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          availability?: string | null
          contact_discord?: string | null
          contact_email?: string | null
          expires_at?: string | null
          id?: string
          level?: string | null
          marked_at?: string
          note?: string | null
          roles?: string[]
          source?: string
          team_id?: string | null
          team_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_openings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_openings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_ratings: {
        Row: {
          created_at: string
          games_played: number
          id: string
          losses: number
          rating: number
          rd: number | null
          roster_size: number
          team_id: string
          tenant_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          created_at?: string
          games_played?: number
          id?: string
          losses?: number
          rating?: number
          rd?: number | null
          roster_size?: number
          team_id: string
          tenant_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          created_at?: string
          games_played?: number
          id?: string
          losses?: number
          rating?: number
          rd?: number | null
          roster_size?: number
          team_id?: string
          tenant_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_ratings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          objectives: string | null
          opponent_team_id: string | null
          played_at: string | null
          subject_id: string
          subject_type: string
          team_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vod_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          objectives?: string | null
          opponent_team_id?: string | null
          played_at?: string | null
          subject_id: string
          subject_type: string
          team_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vod_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          objectives?: string | null
          opponent_team_id?: string | null
          played_at?: string | null
          subject_id?: string
          subject_type?: string
          team_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vod_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_reviews_opponent_team_id_fkey"
            columns: ["opponent_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reviews_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          accent_color: string | null
          achievements: Json
          banner_focal: string | null
          banner_overlay: string | null
          banner_url: string | null
          captain_id: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          discord: string | null
          discord_channel_id: string | null
          discord_role_id: string | null
          discord_voice_channel_id: string | null
          embed_id: string | null
          embed_provider: string | null
          id: string
          instagram: string | null
          is_active: boolean | null
          is_joinable: boolean
          logo_credit_name: string | null
          logo_credit_url: string | null
          logo_url: string | null
          name: string
          open_for_scrim: boolean
          pinned_announcement: string | null
          pinned_announcement_until: string | null
          preferred_locale: string | null
          public_content: string | null
          secondary_color: string | null
          short_name: string | null
          skill_rating: number | null
          slug: string | null
          sponsors: Json
          tcg_image_path: string | null
          tenant_id: string
          tiktok: string | null
          twitch: string | null
          twitter: string | null
          updated_at: string | null
          website: string | null
          youtube: string | null
        }
        Insert: {
          accent_color?: string | null
          achievements?: Json
          banner_focal?: string | null
          banner_overlay?: string | null
          banner_url?: string | null
          captain_id?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          discord?: string | null
          discord_channel_id?: string | null
          discord_role_id?: string | null
          discord_voice_channel_id?: string | null
          embed_id?: string | null
          embed_provider?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean | null
          is_joinable?: boolean
          logo_credit_name?: string | null
          logo_credit_url?: string | null
          logo_url?: string | null
          name: string
          open_for_scrim?: boolean
          pinned_announcement?: string | null
          pinned_announcement_until?: string | null
          preferred_locale?: string | null
          public_content?: string | null
          secondary_color?: string | null
          short_name?: string | null
          skill_rating?: number | null
          slug?: string | null
          sponsors?: Json
          tcg_image_path?: string | null
          tenant_id: string
          tiktok?: string | null
          twitch?: string | null
          twitter?: string | null
          updated_at?: string | null
          website?: string | null
          youtube?: string | null
        }
        Update: {
          accent_color?: string | null
          achievements?: Json
          banner_focal?: string | null
          banner_overlay?: string | null
          banner_url?: string | null
          captain_id?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          discord?: string | null
          discord_channel_id?: string | null
          discord_role_id?: string | null
          discord_voice_channel_id?: string | null
          embed_id?: string | null
          embed_provider?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean | null
          is_joinable?: boolean
          logo_credit_name?: string | null
          logo_credit_url?: string | null
          logo_url?: string | null
          name?: string
          open_for_scrim?: boolean
          pinned_announcement?: string | null
          pinned_announcement_until?: string | null
          preferred_locale?: string | null
          public_content?: string | null
          secondary_color?: string | null
          short_name?: string | null
          skill_rating?: number | null
          slug?: string | null
          sponsors?: Json
          tcg_image_path?: string | null
          tenant_id?: string
          tiktok?: string | null
          twitch?: string | null
          twitter?: string | null
          updated_at?: string | null
          website?: string | null
          youtube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_api_tokens: {
        Row: {
          comp: boolean
          comp_note: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
          token_hash: string
          token_prefix: string
        }
        Insert: {
          comp?: boolean
          comp_note?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
          token_hash: string
          token_prefix: string
        }
        Update: {
          comp?: boolean
          comp_note?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_discord_config: {
        Row: {
          captain_role_id: string | null
          created_at: string
          disputes_forum_channel_id: string | null
          disputes_forum_tag_open_id: string | null
          disputes_forum_tag_pending_id: string | null
          disputes_forum_tag_resolved_id: string | null
          extras: Json
          free_players_channel_id: string | null
          guild_id: string
          matches_live_channel_id: string | null
          member_leave_channel_id: string | null
          mvp_results_channel_id: string | null
          news_ingest_channel_id: string | null
          placement_roles: Json | null
          scrims_announce_channel_id: string | null
          staff_log_channel_id: string | null
          staff_role_admin_id: string | null
          staff_role_caster_id: string | null
          staff_role_owner_id: string | null
          substitute_role_id: string | null
          team_openings_channel_id: string | null
          teams_voice_category_id: string | null
          updated_at: string
          welcome_channel_id: string | null
          welcome_dm_message: string | null
          welcome_enabled: boolean
          welcome_message: string | null
        }
        Insert: {
          captain_role_id?: string | null
          created_at?: string
          disputes_forum_channel_id?: string | null
          disputes_forum_tag_open_id?: string | null
          disputes_forum_tag_pending_id?: string | null
          disputes_forum_tag_resolved_id?: string | null
          extras?: Json
          free_players_channel_id?: string | null
          guild_id: string
          matches_live_channel_id?: string | null
          member_leave_channel_id?: string | null
          mvp_results_channel_id?: string | null
          news_ingest_channel_id?: string | null
          placement_roles?: Json | null
          scrims_announce_channel_id?: string | null
          staff_log_channel_id?: string | null
          staff_role_admin_id?: string | null
          staff_role_caster_id?: string | null
          staff_role_owner_id?: string | null
          substitute_role_id?: string | null
          team_openings_channel_id?: string | null
          teams_voice_category_id?: string | null
          updated_at?: string
          welcome_channel_id?: string | null
          welcome_dm_message?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Update: {
          captain_role_id?: string | null
          created_at?: string
          disputes_forum_channel_id?: string | null
          disputes_forum_tag_open_id?: string | null
          disputes_forum_tag_pending_id?: string | null
          disputes_forum_tag_resolved_id?: string | null
          extras?: Json
          free_players_channel_id?: string | null
          guild_id?: string
          matches_live_channel_id?: string | null
          member_leave_channel_id?: string | null
          mvp_results_channel_id?: string | null
          news_ingest_channel_id?: string | null
          placement_roles?: Json | null
          scrims_announce_channel_id?: string | null
          staff_log_channel_id?: string | null
          staff_role_admin_id?: string | null
          staff_role_caster_id?: string | null
          staff_role_owner_id?: string | null
          substitute_role_id?: string | null
          team_openings_channel_id?: string | null
          teams_voice_category_id?: string | null
          updated_at?: string
          welcome_channel_id?: string | null
          welcome_dm_message?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_discord_config_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: true
            referencedRelation: "discord_guilds"
            referencedColumns: ["guild_id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_staff_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_staff_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_staff_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_accepted_staff_id_fkey"
            columns: ["accepted_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_map_pool: {
        Row: {
          created_at: string
          enabled: boolean
          game: string
          id: string
          image_url: string | null
          map_name: string
          map_type: string | null
          order_index: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          game: string
          id?: string
          image_url?: string | null
          map_name: string
          map_type?: string | null
          order_index?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          game?: string
          id?: string
          image_url?: string | null
          map_name?: string
          map_type?: string | null
          order_index?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_map_pool_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_plan_checkouts: {
        Row: {
          amount_expected: number
          checkout_intent_id: number
          created_at: string
          created_by: string | null
          id: number
          plan: string
          tenant_id: string
          term: string
        }
        Insert: {
          amount_expected: number
          checkout_intent_id: number
          created_at?: string
          created_by?: string | null
          id?: number
          plan: string
          tenant_id: string
          term?: string
        }
        Update: {
          amount_expected?: number
          checkout_intent_id?: number
          created_at?: string
          created_by?: string | null
          id?: number
          plan?: string
          tenant_id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_plan_checkouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_plan_payments: {
        Row: {
          amount: number
          applied_at: string
          checkout_intent_id: number | null
          helloasso_payment_id: number
          id: number
          plan: string
          tenant_id: string
        }
        Insert: {
          amount: number
          applied_at?: string
          checkout_intent_id?: number | null
          helloasso_payment_id: number
          id?: number
          plan: string
          tenant_id: string
        }
        Update: {
          amount?: number
          applied_at?: string
          checkout_intent_id?: number | null
          helloasso_payment_id?: number
          id?: number
          plan?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_plan_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_requests: {
        Row: {
          cgv_accepted_at: string | null
          cgv_version: string | null
          created_at: string
          created_guild_id: string | null
          created_tenant_id: string | null
          description: string | null
          email_verification_token: string | null
          email_verified_at: string | null
          id: string
          ip_address: unknown
          pending_secrets_reveal: Json | null
          rejection_reason: string | null
          requested_name: string
          requested_slug: string
          requester_auth_user_id: string | null
          requester_discord_display_name: string | null
          requester_discord_user_id: string
          requester_email: string
          secrets_reveal_token: string | null
          secrets_reveal_token_expires_at: string | null
          secrets_revealed_at: string | null
          source: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          cgv_accepted_at?: string | null
          cgv_version?: string | null
          created_at?: string
          created_guild_id?: string | null
          created_tenant_id?: string | null
          description?: string | null
          email_verification_token?: string | null
          email_verified_at?: string | null
          id?: string
          ip_address?: unknown
          pending_secrets_reveal?: Json | null
          rejection_reason?: string | null
          requested_name: string
          requested_slug: string
          requester_auth_user_id?: string | null
          requester_discord_display_name?: string | null
          requester_discord_user_id: string
          requester_email: string
          secrets_reveal_token?: string | null
          secrets_reveal_token_expires_at?: string | null
          secrets_revealed_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          cgv_accepted_at?: string | null
          cgv_version?: string | null
          created_at?: string
          created_guild_id?: string | null
          created_tenant_id?: string | null
          description?: string | null
          email_verification_token?: string | null
          email_verified_at?: string | null
          id?: string
          ip_address?: unknown
          pending_secrets_reveal?: Json | null
          rejection_reason?: string | null
          requested_name?: string
          requested_slug?: string
          requester_auth_user_id?: string | null
          requester_discord_display_name?: string | null
          requester_discord_user_id?: string
          requester_email?: string
          secrets_reveal_token?: string | null
          secrets_reveal_token_expires_at?: string | null
          secrets_revealed_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_requests_created_tenant_id_fkey"
            columns: ["created_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_secrets: {
        Row: {
          bot_api_key_hash: string
          bot_webhook_secret: string
          created_at: string
          is_platform_key: boolean
          last_used_at: string | null
          previous_key_expires_at: string | null
          previous_key_hash: string | null
          rotated_at: string
          tenant_id: string
        }
        Insert: {
          bot_api_key_hash: string
          bot_webhook_secret: string
          created_at?: string
          is_platform_key?: boolean
          last_used_at?: string | null
          previous_key_expires_at?: string | null
          previous_key_hash?: string | null
          rotated_at?: string
          tenant_id: string
        }
        Update: {
          bot_api_key_hash?: string
          bot_webhook_secret?: string
          created_at?: string
          is_platform_key?: boolean
          last_used_at?: string | null
          previous_key_expires_at?: string | null
          previous_key_hash?: string | null
          rotated_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_staff: {
        Row: {
          created_at: string
          role: string
          staff_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          staff_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          role?: string
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          cgv_accepted_at: string | null
          cgv_accepted_by: string | null
          cgv_version: string | null
          created_at: string
          custom_domain: string | null
          custom_domain_checked_at: string | null
          custom_domain_error: string | null
          custom_domain_state: string | null
          custom_domain_token: string | null
          default_locale: string
          dispute_sla_minutes: number
          id: string
          is_active: boolean
          kind: string
          lifecycle_changed_at: string | null
          lifecycle_changed_by: string | null
          lifecycle_reason: string | null
          lifecycle_state: string
          logo_url: string | null
          name: string
          network_share_recruitment: boolean
          network_share_scrims: boolean
          nonprofit_org_name: string | null
          nonprofit_rna: string | null
          nonprofit_rna_declared_at: string | null
          nonprofit_verified_at: string | null
          nonprofit_verified_via: string | null
          plan: string
          plan_expires_at: string | null
          plan_is_trial: boolean
          plan_last_reminder_at: string | null
          plan_started_at: string | null
          plan_status: string
          plan_term: string
          primary_color: string | null
          purge_after: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          cgv_accepted_at?: string | null
          cgv_accepted_by?: string | null
          cgv_version?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_checked_at?: string | null
          custom_domain_error?: string | null
          custom_domain_state?: string | null
          custom_domain_token?: string | null
          default_locale?: string
          dispute_sla_minutes?: number
          id?: string
          is_active?: boolean
          kind?: string
          lifecycle_changed_at?: string | null
          lifecycle_changed_by?: string | null
          lifecycle_reason?: string | null
          lifecycle_state?: string
          logo_url?: string | null
          name: string
          network_share_recruitment?: boolean
          network_share_scrims?: boolean
          nonprofit_org_name?: string | null
          nonprofit_rna?: string | null
          nonprofit_rna_declared_at?: string | null
          nonprofit_verified_at?: string | null
          nonprofit_verified_via?: string | null
          plan?: string
          plan_expires_at?: string | null
          plan_is_trial?: boolean
          plan_last_reminder_at?: string | null
          plan_started_at?: string | null
          plan_status?: string
          plan_term?: string
          primary_color?: string | null
          purge_after?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          cgv_accepted_at?: string | null
          cgv_accepted_by?: string | null
          cgv_version?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_checked_at?: string | null
          custom_domain_error?: string | null
          custom_domain_state?: string | null
          custom_domain_token?: string | null
          default_locale?: string
          dispute_sla_minutes?: number
          id?: string
          is_active?: boolean
          kind?: string
          lifecycle_changed_at?: string | null
          lifecycle_changed_by?: string | null
          lifecycle_reason?: string | null
          lifecycle_state?: string
          logo_url?: string | null
          name?: string
          network_share_recruitment?: boolean
          network_share_scrims?: boolean
          nonprofit_org_name?: string | null
          nonprofit_rna?: string | null
          nonprofit_rna_declared_at?: string | null
          nonprofit_verified_at?: string | null
          nonprofit_verified_via?: string | null
          plan?: string
          plan_expires_at?: string | null
          plan_is_trial?: boolean
          plan_last_reminder_at?: string | null
          plan_started_at?: string | null
          plan_status?: string
          plan_term?: string
          primary_color?: string | null
          purge_after?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_lifecycle_changed_by_fkey"
            columns: ["lifecycle_changed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_maps: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          image_url: string | null
          map_name: string
          map_slug: string | null
          map_type: string | null
          order_index: number | null
          play_date: string | null
          round_number: number | null
          tenant_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string | null
          map_name: string
          map_slug?: string | null
          map_type?: string | null
          order_index?: number | null
          play_date?: string | null
          round_number?: number | null
          tenant_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string | null
          map_name?: string
          map_slug?: string | null
          map_type?: string | null
          order_index?: number | null
          play_date?: string | null
          round_number?: number | null
          tenant_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_maps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_maps_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_pool_entries: {
        Row: {
          battle_tag: string
          created_at: string
          display_name: string
          id: string
          origin_team_id: string | null
          placed_at: string | null
          placed_team_id: string | null
          status: string
          tenant_id: string
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          battle_tag: string
          created_at?: string
          display_name: string
          id?: string
          origin_team_id?: string | null
          placed_at?: string | null
          placed_team_id?: string | null
          status?: string
          tenant_id: string
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          battle_tag?: string
          created_at?: string
          display_name?: string
          id?: string
          origin_team_id?: string | null
          placed_at?: string | null
          placed_team_id?: string | null
          status?: string
          tenant_id?: string
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_pool_entries_origin_team_id_fkey"
            columns: ["origin_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_pool_entries_placed_team_id_fkey"
            columns: ["placed_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_pool_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_pool_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_prize_pools: {
        Row: {
          base_amount_cents: number
          created_at: string
          currency: string
          goal_amount_cents: number | null
          id: string
          is_open: boolean
          raised_amount_cents: number
          tenant_id: string
          title: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          base_amount_cents?: number
          created_at?: string
          currency?: string
          goal_amount_cents?: number | null
          id?: string
          is_open?: boolean
          raised_amount_cents?: number
          tenant_id: string
          title?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          base_amount_cents?: number
          created_at?: string
          currency?: string
          goal_amount_cents?: number | null
          id?: string
          is_open?: boolean
          raised_amount_cents?: number
          tenant_id?: string
          title?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_prize_pools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_prize_pools_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_stages: {
        Row: {
          bracket_format: string | null
          created_at: string | null
          default_match_format: string | null
          deleted_at: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          name: string
          order_index: number | null
          settings: Json | null
          slug: string | null
          stage_type: string
          start_date: string | null
          swiss_rounds: number | null
          tenant_id: string
          tiebreaker_policy: string | null
          tournament_id: string
          updated_at: string | null
          visible: boolean | null
        }
        Insert: {
          bracket_format?: string | null
          created_at?: string | null
          default_match_format?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          name: string
          order_index?: number | null
          settings?: Json | null
          slug?: string | null
          stage_type: string
          start_date?: string | null
          swiss_rounds?: number | null
          tenant_id: string
          tiebreaker_policy?: string | null
          tournament_id: string
          updated_at?: string | null
          visible?: boolean | null
        }
        Update: {
          bracket_format?: string | null
          created_at?: string | null
          default_match_format?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string
          order_index?: number | null
          settings?: Json | null
          slug?: string | null
          stage_type?: string
          start_date?: string | null
          swiss_rounds?: number | null
          tenant_id?: string
          tiebreaker_policy?: string | null
          tournament_id?: string
          updated_at?: string | null
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "stages_tournament_fk"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          created_at: string | null
          field_values: Json
          id: string
          roster_unlocked_until: string | null
          seed: number | null
          status: string | null
          team_id: string
          tenant_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string | null
          field_values?: Json
          id?: string
          roster_unlocked_until?: string | null
          seed?: number | null
          status?: string | null
          team_id: string
          tenant_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string | null
          field_values?: Json
          id?: string
          roster_unlocked_until?: string | null
          seed?: number | null
          status?: string | null
          team_id?: string
          tenant_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          banner_url: string | null
          checkin_grace_minutes: number
          created_at: string | null
          default_stream_url: string | null
          description_info: string | null
          end_date: string | null
          format: string | null
          format_details: string | null
          format_type: string | null
          game: string | null
          id: string
          is_featured: boolean
          j1_reminder_sent_at: string | null
          logo_url: string | null
          max_players: number | null
          max_teams: number | null
          min_players: number | null
          name: string
          overlay_day_date: string | null
          overlay_day_set_at: string | null
          pooled_teams: boolean
          registration_fields: Json
          reviews_playlist_id: string | null
          roster_locked_at: string | null
          roster_unlocked_until: string | null
          rules_url: string | null
          schedule_details: string | null
          schedule_rules: string | null
          short_name: string | null
          slug: string | null
          solo_mode: boolean
          start_date: string | null
          status: string
          tenant_id: string
          timezone: string | null
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          banner_url?: string | null
          checkin_grace_minutes?: number
          created_at?: string | null
          default_stream_url?: string | null
          description_info?: string | null
          end_date?: string | null
          format?: string | null
          format_details?: string | null
          format_type?: string | null
          game?: string | null
          id?: string
          is_featured?: boolean
          j1_reminder_sent_at?: string | null
          logo_url?: string | null
          max_players?: number | null
          max_teams?: number | null
          min_players?: number | null
          name: string
          overlay_day_date?: string | null
          overlay_day_set_at?: string | null
          pooled_teams?: boolean
          registration_fields?: Json
          reviews_playlist_id?: string | null
          roster_locked_at?: string | null
          roster_unlocked_until?: string | null
          rules_url?: string | null
          schedule_details?: string | null
          schedule_rules?: string | null
          short_name?: string | null
          slug?: string | null
          solo_mode?: boolean
          start_date?: string | null
          status?: string
          tenant_id: string
          timezone?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          banner_url?: string | null
          checkin_grace_minutes?: number
          created_at?: string | null
          default_stream_url?: string | null
          description_info?: string | null
          end_date?: string | null
          format?: string | null
          format_details?: string | null
          format_type?: string | null
          game?: string | null
          id?: string
          is_featured?: boolean
          j1_reminder_sent_at?: string | null
          logo_url?: string | null
          max_players?: number | null
          max_teams?: number | null
          min_players?: number | null
          name?: string
          overlay_day_date?: string | null
          overlay_day_set_at?: string | null
          pooled_teams?: boolean
          registration_fields?: Json
          reviews_playlist_id?: string | null
          roster_locked_at?: string | null
          roster_unlocked_until?: string | null
          rules_url?: string | null
          schedule_details?: string | null
          schedule_rules?: string | null
          short_name?: string | null
          slug?: string | null
          solo_mode?: boolean
          start_date?: string | null
          status?: string
          tenant_id?: string
          timezone?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      twitch_broadcaster_connections: {
        Row: {
          access_token_enc: string
          broadcaster_id: string
          broadcaster_login: string
          connected_by_user_id: string | null
          created_at: string
          expires_at: string
          refresh_token_enc: string
          scope: string[]
          tcg_featured_fanart_id: string | null
          tcg_featured_reward_id: string | null
          tcg_reward_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          broadcaster_id: string
          broadcaster_login: string
          connected_by_user_id?: string | null
          created_at?: string
          expires_at: string
          refresh_token_enc: string
          scope?: string[]
          tcg_featured_fanart_id?: string | null
          tcg_featured_reward_id?: string | null
          tcg_reward_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          broadcaster_id?: string
          broadcaster_login?: string
          connected_by_user_id?: string | null
          created_at?: string
          expires_at?: string
          refresh_token_enc?: string
          scope?: string[]
          tcg_featured_fanart_id?: string | null
          tcg_featured_reward_id?: string | null
          tcg_reward_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "twitch_broadcaster_connections_tcg_featured_fanart_id_fkey"
            columns: ["tcg_featured_fanart_id"]
            isOneToOne: false
            referencedRelation: "tcg_fanart_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twitch_broadcaster_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      twitch_channels: {
        Row: {
          background_url: string | null
          badge: string | null
          channel: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          sort_order: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          background_url?: string | null
          badge?: string | null
          channel: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          background_url?: string | null
          badge?: string | null
          channel?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twitch_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_battlenet_links: {
        Row: {
          auth_user_id: string
          battle_net_id: string
          battle_tag: string
          created_at: string
          region: string | null
          updated_at: string
          verified_at: string
        }
        Insert: {
          auth_user_id: string
          battle_net_id: string
          battle_tag: string
          created_at?: string
          region?: string | null
          updated_at?: string
          verified_at?: string
        }
        Update: {
          auth_user_id?: string
          battle_net_id?: string
          battle_tag?: string
          created_at?: string
          region?: string | null
          updated_at?: string
          verified_at?: string
        }
        Relationships: []
      }
      user_discord_links: {
        Row: {
          auth_user_id: string
          discord_user_id: string
          discord_username: string | null
          linked_at: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          discord_user_id: string
          discord_username?: string | null
          linked_at?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          discord_user_id?: string
          discord_username?: string | null
          linked_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_twitch_links: {
        Row: {
          auth_user_id: string
          linked_at: string
          twitch_login: string | null
          twitch_user_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          linked_at?: string
          twitch_login?: string | null
          twitch_user_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          linked_at?: string
          twitch_login?: string | null
          twitch_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      web_push_deliveries: {
        Row: {
          acked_at: string | null
          attempts: number
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          outbox_event_id: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          acked_at?: string | null
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          outbox_event_id: string
          status: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          acked_at?: string | null
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          outbox_event_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_deliveries_outbox_event_id_fkey"
            columns: ["outbox_event_id"]
            isOneToOne: false
            referencedRelation: "bot_event_outbox"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "web_push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          event_name: string
          id: string
          last_error: string | null
          outbox_event_id: string
          response_status: number | null
          status: string
          subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event_name: string
          id?: string
          last_error?: string | null
          outbox_event_id: string
          response_status?: number | null
          status?: string
          subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event_name?: string
          id?: string
          last_error?: string | null
          outbox_event_id?: string
          response_status?: number | null
          status?: string
          subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_subscription_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          consecutive_failures: number
          created_at: string
          created_by: string | null
          description: string | null
          disabled_at: string | null
          enabled: boolean
          event_types: string[]
          id: string
          last_delivery_at: string | null
          last_error: string | null
          secret: string
          tenant_id: string
          url: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled_at?: string | null
          enabled?: boolean
          event_types?: string[]
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          secret: string
          tenant_id: string
          url: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled_at?: string | null
          enabled?: boolean
          event_types?: string[]
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          secret?: string
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      map_stats_view: {
        Row: {
          diff_team1: number | null
          diff_team2: number | null
          games_played: number | null
          map_name: string | null
          total_rounds: number | null
          wins_team1: number | null
          wins_team2: number | null
        }
        Relationships: []
      }
      team_map_stats: {
        Row: {
          games_played: number | null
          losses: number | null
          map_name: string | null
          rounds_lost: number | null
          rounds_won: number | null
          team_id: string | null
          tenant_id: string | null
          win_rate: number | null
          wins: number | null
        }
        Relationships: []
      }
      team_stats_view: {
        Row: {
          draws: number | null
          last_match_at: string | null
          losses: number | null
          map_ties: number | null
          map_winrate: number | null
          maps_lost: number | null
          maps_won: number | null
          matches_played: number | null
          points: number | null
          team_id: string | null
          team_logo_url: string | null
          team_name: string | null
          team_short_name: string | null
          tournament_id: string | null
          tournament_name: string | null
          tournament_slug: string | null
          winrate: number | null
          wins: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_demande_id: string; p_user_id: string }
        Returns: Json
      }
      admin_get_user_profiles: {
        Args: { p_ids: string[] }
        Returns: {
          avatar_url: string
          battle_tag: string
          discord: string
          display_name: string
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_list_users: {
        Args: {
          p_dir?: string
          p_filters?: string[]
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_role?: string
          p_sort?: string
        }
        Returns: {
          banned_until: string
          created_at: string
          display_name: string
          email: string
          id: string
          last_sign_in_at: string
          role: string
          total_count: number
        }[]
      }
      admin_search_tcg_players: {
        Args: { p_query: string; p_tenant_id: string }
        Returns: {
          battle_tag: string
          display_name: string
          id: string
          team_name: string
        }[]
      }
      admin_search_users: {
        Args: { p_query: string }
        Returns: {
          battle_tag: string
          display_name: string
          email: string
          id: string
          team_id: string
          team_name: string
        }[]
      }
      approve_join_request: { Args: { p_demande_id: string }; Returns: Json }
      approve_transfer_request: {
        Args: { p_demande_id: string }
        Returns: Json
      }
      consume_api_usage: {
        Args: { p_minute_key: string; p_month_key: string; p_tenant_id: string }
        Returns: {
          minute_count: number
          month_count: number
        }[]
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      count_confirmed_auth_users: { Args: never; Returns: number }
      designate_captain: {
        Args: { p_new_captain: string; p_team_id: string; p_tenant: string }
        Returns: Json
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      introspect_foreign_keys: {
        Args: never
        Returns: {
          constraint_name: string
          source_table: string
          target_table: string
        }[]
      }
      pool_place: {
        Args: {
          p_entry_ids: string[]
          p_team_id: string
          p_team_size?: number
          p_tenant_id: string
          p_tournament_id: string
        }
        Returns: number
      }
      pool_register: {
        Args: {
          p_battle_tag: string
          p_display_name: string
          p_origin_team_id: string
          p_team_size?: number
          p_tenant_id: string
          p_tournament_id: string
          p_user_id: string
        }
        Returns: {
          entry_id: string
          entry_status: string
          team_registered: boolean
        }[]
      }
      pool_unplace: {
        Args: {
          p_entry_id: string
          p_tenant_id: string
          p_tournament_id: string
        }
        Returns: string
      }
      reassign_captain: {
        Args: { p_new_captain: string; p_team_id: string; p_tenant: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify_text: { Args: { input: string }; Returns: string }
      tcg_accept_trade: {
        Args: {
          p_max_accepted_per_day: number
          p_min_account_age_days: number
          p_min_collection_age_days: number
          p_tenant_id: string
          p_trade_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tcg_admin_debit: {
        Args: {
          p_cost: number
          p_note: string
          p_source_ref: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tcg_buy_cosmetic: {
        Args: {
          p_key: string
          p_price: number
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tcg_forge_card: {
        Args: {
          p_card_fanart_id?: string
          p_card_map_slug?: string
          p_card_mascot_slug?: string
          p_card_team_id?: string
          p_card_user_id?: string
          p_cards: Json
          p_fee: number
          p_rarity: string
          p_subject_kind: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tcg_pack_source_tradeable: {
        Args: { p_source_kind: string }
        Returns: boolean
      }
      tcg_propose_trade: {
        Args: {
          p_decline_cooldown_hours: number
          p_max_cards: number
          p_max_pending_received: number
          p_max_pending_sent: number
          p_min_account_age_days: number
          p_min_collection_age_days: number
          p_offered: Json
          p_proposer_id: string
          p_recipient_id: string
          p_requested: Json
          p_tenant_id: string
          p_ttl_hours: number
        }
        Returns: Json
      }
      tcg_purchase_booster: {
        Args: { p_price: number; p_tenant_id: string; p_user_id: string }
        Returns: Json
      }
      tcg_rarity_rank: { Args: { p_rarity: string }; Returns: number }
      tcg_refresh_wallet_balance: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: number
      }
      tcg_trade_eligibility: {
        Args: {
          p_min_account_age_days: number
          p_min_collection_age_days: number
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tcg_trade_lock_key: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: number
      }
      transfer_captain: {
        Args: {
          p_actor: string
          p_new_captain: string
          p_team_id: string
          p_tenant: string
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
