export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      auth_events: {
        Row: {
          action: string;
          audit_id: string | null;
          category: string;
          email: string | null;
          email_kind: string | null;
          id: string;
          occurred_at: string;
          user_id: string;
        };
        Insert: {
          action: string;
          audit_id?: string | null;
          category: string;
          email?: string | null;
          email_kind?: string | null;
          id?: string;
          occurred_at?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          audit_id?: string | null;
          category?: string;
          email?: string | null;
          email_kind?: string | null;
          id?: string;
          occurred_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      content_favorites: {
        Row: {
          collection: string;
          created_at: string;
          id: string;
          item_id: string;
          user_id: string;
        };
        Insert: {
          collection: string;
          created_at?: string;
          id?: string;
          item_id: string;
          user_id: string;
        };
        Update: {
          collection?: string;
          created_at?: string;
          id?: string;
          item_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      files: {
        Row: {
          bucket: string;
          created_at: string;
          id: string;
          mime_type: string | null;
          path: string;
          size_bytes: number | null;
          user_id: string;
        };
        Insert: {
          bucket?: string;
          created_at?: string;
          id?: string;
          mime_type?: string | null;
          path: string;
          size_bytes?: number | null;
          user_id: string;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          id?: string;
          mime_type?: string | null;
          path?: string;
          size_bytes?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string | null;
          id: string;
          invited_by: string | null;
          org_id: string;
          role: string;
          status: string;
          token_hash: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string | null;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          role?: string;
          status?: string;
          token_hash?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string | null;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          role?: string;
          status?: string;
          token_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      kit_embed_origins: {
        Row: {
          created_at: string;
          module: string;
          origin: string;
        };
        Insert: {
          created_at?: string;
          module: string;
          origin: string;
        };
        Update: {
          created_at?: string;
          module?: string;
          origin?: string;
        };
        Relationships: [];
      };
      mcp_authorization_codes: {
        Row: {
          client_id: string;
          code: string;
          code_challenge: string;
          code_challenge_method: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          redirect_uri: string;
          scope: string | null;
          supabase_user_id: string;
        };
        Insert: {
          client_id: string;
          code: string;
          code_challenge: string;
          code_challenge_method?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          redirect_uri: string;
          scope?: string | null;
          supabase_user_id: string;
        };
        Update: {
          client_id?: string;
          code?: string;
          code_challenge?: string;
          code_challenge_method?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          redirect_uri?: string;
          scope?: string | null;
          supabase_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mcp_authorization_codes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "mcp_oauth_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mcp_authorization_codes_supabase_user_id_fkey";
            columns: ["supabase_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mcp_oauth_clients: {
        Row: {
          client_name: string | null;
          client_secret_hash: string | null;
          created_at: string;
          grant_types: string[];
          id: string;
          redirect_uris: string[];
          scope: string | null;
          token_endpoint_auth_method: string;
        };
        Insert: {
          client_name?: string | null;
          client_secret_hash?: string | null;
          created_at?: string;
          grant_types?: string[];
          id: string;
          redirect_uris: string[];
          scope?: string | null;
          token_endpoint_auth_method?: string;
        };
        Update: {
          client_name?: string | null;
          client_secret_hash?: string | null;
          created_at?: string;
          grant_types?: string[];
          id?: string;
          redirect_uris?: string[];
          scope?: string | null;
          token_endpoint_auth_method?: string;
        };
        Relationships: [];
      };
      mcp_refresh_tokens: {
        Row: {
          client_id: string;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
          rotated_to: string | null;
          scope: string | null;
          supabase_user_id: string;
          token_hash: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          expires_at: string;
          revoked_at?: string | null;
          rotated_to?: string | null;
          scope?: string | null;
          supabase_user_id: string;
          token_hash: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          expires_at?: string;
          revoked_at?: string | null;
          rotated_to?: string | null;
          scope?: string | null;
          supabase_user_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mcp_refresh_tokens_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "mcp_oauth_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mcp_refresh_tokens_supabase_user_id_fkey";
            columns: ["supabase_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          onboarding_completed_at: string | null;
          onboarding_done: string[];
          onboarding_step: string | null;
          org_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          onboarding_completed_at?: string | null;
          onboarding_done?: string[];
          onboarding_step?: string | null;
          org_id: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          onboarding_completed_at?: string | null;
          onboarding_done?: string[];
          onboarding_step?: string | null;
          org_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_billing_customers: {
        Row: {
          billing_email: string | null;
          created_at: string;
          id: string;
          stripe_customer_id: string;
          user_id: string;
        };
        Insert: {
          billing_email?: string | null;
          created_at?: string;
          id?: string;
          stripe_customer_id: string;
          user_id: string;
        };
        Update: {
          billing_email?: string | null;
          created_at?: string;
          id?: string;
          stripe_customer_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_billing_customers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_billing_prices: {
        Row: {
          active: boolean;
          created_at: string;
          currency: string | null;
          id: string;
          interval: string | null;
          interval_count: number | null;
          metadata: Json | null;
          product_id: string | null;
          type: string | null;
          unit_amount: number | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          currency?: string | null;
          id: string;
          interval?: string | null;
          interval_count?: number | null;
          metadata?: Json | null;
          product_id?: string | null;
          type?: string | null;
          unit_amount?: number | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          currency?: string | null;
          id?: string;
          interval?: string | null;
          interval_count?: number | null;
          metadata?: Json | null;
          product_id?: string | null;
          type?: string | null;
          unit_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_billing_prices_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "mod_billing_products";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_billing_products: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          id: string;
          image: string | null;
          metadata: Json | null;
          name: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id: string;
          image?: string | null;
          metadata?: Json | null;
          name?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          image?: string | null;
          metadata?: Json | null;
          name?: string | null;
        };
        Relationships: [];
      };
      mod_billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          id: string;
          price_id: string | null;
          quantity: number | null;
          status: string | null;
          stripe_event_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id: string;
          price_id?: string | null;
          quantity?: number | null;
          status?: string | null;
          stripe_event_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          price_id?: string | null;
          quantity?: number | null;
          status?: string | null;
          stripe_event_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_billing_subscriptions_price_id_fkey";
            columns: ["price_id"];
            isOneToOne: false;
            referencedRelation: "mod_billing_prices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_billing_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_billing_webhook_events: {
        Row: {
          claimed_at: string | null;
          id: string;
          received_at: string;
          status: string;
          type: string;
        };
        Insert: {
          claimed_at?: string | null;
          id: string;
          received_at?: string;
          status?: string;
          type: string;
        };
        Update: {
          claimed_at?: string | null;
          id?: string;
          received_at?: string;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      mod_chat_channel_contacts: {
        Row: {
          channel: string;
          contact_key: string;
          created_at: string;
          display_name: string | null;
          opted_out: boolean;
          user_id: string | null;
        };
        Insert: {
          channel: string;
          contact_key: string;
          created_at?: string;
          display_name?: string | null;
          opted_out?: boolean;
          user_id?: string | null;
        };
        Update: {
          channel?: string;
          contact_key?: string;
          created_at?: string;
          display_name?: string | null;
          opted_out?: boolean;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_chat_channel_contacts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_chat_documents: {
        Row: {
          content: string | null;
          created_at: string;
          id: string;
          kind: string;
          title: string;
          user_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          title: string;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_chat_documents_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_chat_messages: {
        Row: {
          attachments: Json;
          content: string;
          created_at: string;
          id: string;
          parts: Json | null;
          role: string;
          thread_id: string;
          token_usage: Json | null;
        };
        Insert: {
          attachments?: Json;
          content?: string;
          created_at?: string;
          id?: string;
          parts?: Json | null;
          role: string;
          thread_id: string;
          token_usage?: Json | null;
        };
        Update: {
          attachments?: Json;
          content?: string;
          created_at?: string;
          id?: string;
          parts?: Json | null;
          role?: string;
          thread_id?: string;
          token_usage?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "mod_chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_chat_outbound_counters: {
        Row: {
          count: number;
          day: string;
          sender: string;
        };
        Insert: {
          count?: number;
          day: string;
          sender: string;
        };
        Update: {
          count?: number;
          day?: string;
          sender?: string;
        };
        Relationships: [];
      };
      mod_chat_processed_inbound: {
        Row: {
          channel: string;
          message_handle: string;
          received_at: string;
        };
        Insert: {
          channel: string;
          message_handle: string;
          received_at?: string;
        };
        Update: {
          channel?: string;
          message_handle?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      mod_chat_suggestions: {
        Row: {
          created_at: string;
          description: string | null;
          document_created_at: string;
          document_id: string;
          id: string;
          is_resolved: boolean;
          original_text: string;
          suggested_text: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          document_created_at: string;
          document_id: string;
          id?: string;
          is_resolved?: boolean;
          original_text: string;
          suggested_text: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          document_created_at?: string;
          document_id?: string;
          id?: string;
          is_resolved?: boolean;
          original_text?: string;
          suggested_text?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_chat_suggestions_document_id_document_created_at_fkey";
            columns: ["document_id", "document_created_at"];
            isOneToOne: false;
            referencedRelation: "mod_chat_documents";
            referencedColumns: ["id", "created_at"];
          },
          {
            foreignKeyName: "mod_chat_suggestions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_chat_threads: {
        Row: {
          active_skill_slug: string | null;
          active_skill_turns_remaining: number;
          channel: string;
          channel_thread_key: string | null;
          contact_key: string | null;
          created_at: string;
          id: string;
          last_context: Json | null;
          title: string | null;
          updated_at: string;
          user_id: string | null;
          visibility: string;
        };
        Insert: {
          active_skill_slug?: string | null;
          active_skill_turns_remaining?: number;
          channel?: string;
          channel_thread_key?: string | null;
          contact_key?: string | null;
          created_at?: string;
          id?: string;
          last_context?: Json | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string | null;
          visibility?: string;
        };
        Update: {
          active_skill_slug?: string | null;
          active_skill_turns_remaining?: number;
          channel?: string;
          channel_thread_key?: string | null;
          contact_key?: string | null;
          created_at?: string;
          id?: string;
          last_context?: Json | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_chat_threads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_chat_votes: {
        Row: {
          is_upvoted: boolean;
          message_id: string;
          thread_id: string;
        };
        Insert: {
          is_upvoted: boolean;
          message_id: string;
          thread_id: string;
        };
        Update: {
          is_upvoted?: boolean;
          message_id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_chat_votes_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "mod_chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_chat_votes_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "mod_chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_activity: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          data: Json;
          id: string;
          target_id: string;
          target_type: string;
          undone_at: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          target_id: string;
          target_type: string;
          undone_at?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          target_id?: string;
          target_type?: string;
          undone_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_activity_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          key_hash: string;
          prefix: string;
          revoked_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_hash: string;
          prefix: string;
          revoked_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_hash?: string;
          prefix?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_api_keys_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_boards: {
        Row: {
          access: string;
          allow_new_posts: boolean;
          anon_comments: string;
          anon_posts: string;
          anon_votes: string;
          archived: boolean;
          description: string | null;
          disable_comments_when_done: boolean;
          disable_votes_when_done: boolean;
          form: Json;
          id: string;
          name: string;
          position: number;
          require_approval: boolean;
          search_indexing: boolean;
          segment_tags: string[];
          show_comments_publicly: boolean;
          show_dates: boolean;
          show_on_portal_home: boolean;
          show_vote_counts: boolean;
          show_voters: boolean;
          slug: string;
          synced_at: string;
        };
        Insert: {
          access?: string;
          allow_new_posts?: boolean;
          anon_comments?: string;
          anon_posts?: string;
          anon_votes?: string;
          archived?: boolean;
          description?: string | null;
          disable_comments_when_done?: boolean;
          disable_votes_when_done?: boolean;
          form?: Json;
          id: string;
          name: string;
          position?: number;
          require_approval?: boolean;
          search_indexing?: boolean;
          segment_tags?: string[];
          show_comments_publicly?: boolean;
          show_dates?: boolean;
          show_on_portal_home?: boolean;
          show_vote_counts?: boolean;
          show_voters?: boolean;
          slug: string;
          synced_at?: string;
        };
        Update: {
          access?: string;
          allow_new_posts?: boolean;
          anon_comments?: string;
          anon_posts?: string;
          anon_votes?: string;
          archived?: boolean;
          description?: string | null;
          disable_comments_when_done?: boolean;
          disable_votes_when_done?: boolean;
          form?: Json;
          id?: string;
          name?: string;
          position?: number;
          require_approval?: boolean;
          search_indexing?: boolean;
          segment_tags?: string[];
          show_comments_publicly?: boolean;
          show_dates?: boolean;
          show_on_portal_home?: boolean;
          show_vote_counts?: boolean;
          show_voters?: boolean;
          slug?: string;
          synced_at?: string;
        };
        Relationships: [];
      };
      mod_feedback_categories: {
        Row: {
          archived: boolean;
          board_id: string;
          id: string;
          name: string;
          parent_id: string | null;
          position: number;
          slug: string;
        };
        Insert: {
          archived?: boolean;
          board_id: string;
          id: string;
          name: string;
          parent_id?: string | null;
          position?: number;
          slug: string;
        };
        Update: {
          archived?: boolean;
          board_id?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          position?: number;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_categories_board_id_fkey";
            columns: ["board_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_boards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_changelog_reactions: {
        Row: {
          created_at: string;
          entry_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          entry_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          entry_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_changelog_reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_changelog_reads: {
        Row: {
          last_seen_at: string;
          user_id: string;
        };
        Insert: {
          last_seen_at?: string;
          user_id: string;
        };
        Update: {
          last_seen_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_changelog_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_changelog_subscribers: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_changelog_subscribers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_comments: {
        Row: {
          attachments: Json;
          author_id: string | null;
          body: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          is_internal: boolean;
          parent_id: string | null;
          pinned: boolean;
          post_id: string;
        };
        Insert: {
          attachments?: Json;
          author_id?: string | null;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          is_internal?: boolean;
          parent_id?: string | null;
          pinned?: boolean;
          post_id: string;
        };
        Update: {
          attachments?: Json;
          author_id?: string | null;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          is_internal?: boolean;
          parent_id?: string | null;
          pinned?: boolean;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_idea_stages: {
        Row: {
          archived: boolean;
          id: string;
          name: string;
          notify_voters: boolean;
          portal_status_id: string | null;
          position: number;
          tone: string;
          type: string;
        };
        Insert: {
          archived?: boolean;
          id: string;
          name: string;
          notify_voters?: boolean;
          portal_status_id?: string | null;
          position?: number;
          tone?: string;
          type: string;
        };
        Update: {
          archived?: boolean;
          id?: string;
          name?: string;
          notify_voters?: boolean;
          portal_status_id?: string | null;
          position?: number;
          tone?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_idea_stages_portal_status_id_fkey";
            columns: ["portal_status_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_ideas: {
        Row: {
          archived: boolean;
          created_at: string;
          created_by: string | null;
          description: string;
          eta: string | null;
          eta_public: boolean;
          factor_values: Json;
          id: string;
          owner_id: string | null;
          stage_changed_at: string;
          stage_id: string | null;
          sync_locked: boolean;
          title: string;
          updated_at: string;
          vote_total: number;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          eta?: string | null;
          eta_public?: boolean;
          factor_values?: Json;
          id?: string;
          owner_id?: string | null;
          stage_changed_at?: string;
          stage_id?: string | null;
          sync_locked?: boolean;
          title: string;
          updated_at?: string;
          vote_total?: number;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          eta?: string | null;
          eta_public?: boolean;
          factor_values?: Json;
          id?: string;
          owner_id?: string | null;
          stage_changed_at?: string;
          stage_id?: string | null;
          sync_locked?: boolean;
          title?: string;
          updated_at?: string;
          vote_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_ideas_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_ideas_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_ideas_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_idea_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_inbox: {
        Row: {
          author_email: string | null;
          author_name: string | null;
          confidence: number | null;
          created_at: string;
          id: string;
          kind: string;
          origin_ref: Json;
          post_id: string | null;
          raw_text: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          source: string;
          state: string;
          suggested_board_id: string | null;
          suggested_category_id: string | null;
          suggested_post_id: string | null;
          title: string | null;
        };
        Insert: {
          author_email?: string | null;
          author_name?: string | null;
          confidence?: number | null;
          created_at?: string;
          id?: string;
          kind: string;
          origin_ref?: Json;
          post_id?: string | null;
          raw_text?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source?: string;
          state?: string;
          suggested_board_id?: string | null;
          suggested_category_id?: string | null;
          suggested_post_id?: string | null;
          title?: string | null;
        };
        Update: {
          author_email?: string | null;
          author_name?: string | null;
          confidence?: number | null;
          created_at?: string;
          id?: string;
          kind?: string;
          origin_ref?: Json;
          post_id?: string | null;
          raw_text?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source?: string;
          state?: string;
          suggested_board_id?: string | null;
          suggested_category_id?: string | null;
          suggested_post_id?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_inbox_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_inbox_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_inbox_suggested_board_id_fkey";
            columns: ["suggested_board_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_boards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_inbox_suggested_category_id_fkey";
            columns: ["suggested_category_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_inbox_suggested_post_id_fkey";
            columns: ["suggested_post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_integrations: {
        Row: {
          capabilities: Json;
          created_at: string;
          cursor: string | null;
          enabled: boolean;
          label: string;
          last_error: string | null;
          last_synced_at: string | null;
          provider: string;
          route_base: string;
        };
        Insert: {
          capabilities?: Json;
          created_at?: string;
          cursor?: string | null;
          enabled?: boolean;
          label: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider: string;
          route_base: string;
        };
        Update: {
          capabilities?: Json;
          created_at?: string;
          cursor?: string | null;
          enabled?: boolean;
          label?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          route_base?: string;
        };
        Relationships: [];
      };
      mod_feedback_issue_links: {
        Row: {
          backlink_comment_id: string | null;
          created_at: string;
          external_id: string;
          id: string;
          idea_id: string;
          key: string;
          labels: string[];
          last_synced_at: string | null;
          linked_by: string | null;
          provider: string;
          state_category: string;
          state_raw: string;
          sync_enabled: boolean;
          title: string;
          url: string;
        };
        Insert: {
          backlink_comment_id?: string | null;
          created_at?: string;
          external_id: string;
          id?: string;
          idea_id: string;
          key: string;
          labels?: string[];
          last_synced_at?: string | null;
          linked_by?: string | null;
          provider: string;
          state_category?: string;
          state_raw?: string;
          sync_enabled?: boolean;
          title?: string;
          url: string;
        };
        Update: {
          backlink_comment_id?: string | null;
          created_at?: string;
          external_id?: string;
          id?: string;
          idea_id?: string;
          key?: string;
          labels?: string[];
          last_synced_at?: string | null;
          linked_by?: string | null;
          provider?: string;
          state_category?: string;
          state_raw?: string;
          sync_enabled?: boolean;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_issue_links_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_ideas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_issue_links_linked_by_fkey";
            columns: ["linked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_issue_links_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_integrations";
            referencedColumns: ["provider"];
          },
        ];
      };
      mod_feedback_post_tags: {
        Row: {
          post_id: string;
          tag_id: string;
        };
        Insert: {
          post_id: string;
          tag_id: string;
        };
        Update: {
          post_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_post_tags_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_post_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_posts: {
        Row: {
          ai_processed_at: string | null;
          approval_state: string;
          attachments: Json;
          author_id: string | null;
          board_id: string;
          category_id: string | null;
          comment_count: number;
          created_at: string;
          custom_fields: Json;
          deleted_at: string | null;
          details: string;
          embedding: string | null;
          eta: string | null;
          eta_public: boolean;
          id: string;
          idea_id: string | null;
          merged_into_id: string | null;
          owner_id: string | null;
          pinned: boolean;
          search: unknown;
          slug: string;
          source: string;
          source_ref: Json;
          status_changed_at: string;
          status_id: string | null;
          summary: string | null;
          summary_comment_count: number | null;
          title: string;
          trend_at: string;
          trend_score: number;
          updated_at: string;
          vote_count: number;
        };
        Insert: {
          ai_processed_at?: string | null;
          approval_state?: string;
          attachments?: Json;
          author_id?: string | null;
          board_id: string;
          category_id?: string | null;
          comment_count?: number;
          created_at?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          details?: string;
          embedding?: string | null;
          eta?: string | null;
          eta_public?: boolean;
          id?: string;
          idea_id?: string | null;
          merged_into_id?: string | null;
          owner_id?: string | null;
          pinned?: boolean;
          search?: unknown;
          slug: string;
          source?: string;
          source_ref?: Json;
          status_changed_at?: string;
          status_id?: string | null;
          summary?: string | null;
          summary_comment_count?: number | null;
          title: string;
          trend_at?: string;
          trend_score?: number;
          updated_at?: string;
          vote_count?: number;
        };
        Update: {
          ai_processed_at?: string | null;
          approval_state?: string;
          attachments?: Json;
          author_id?: string | null;
          board_id?: string;
          category_id?: string | null;
          comment_count?: number;
          created_at?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          details?: string;
          embedding?: string | null;
          eta?: string | null;
          eta_public?: boolean;
          id?: string;
          idea_id?: string | null;
          merged_into_id?: string | null;
          owner_id?: string | null;
          pinned?: boolean;
          search?: unknown;
          slug?: string;
          source?: string;
          source_ref?: Json;
          status_changed_at?: string;
          status_id?: string | null;
          summary?: string | null;
          summary_comment_count?: number | null;
          title?: string;
          trend_at?: string;
          trend_score?: number;
          updated_at?: string;
          vote_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_posts_board_id_fkey";
            columns: ["board_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_boards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_posts_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_posts_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_ideas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_posts_merged_into_id_fkey";
            columns: ["merged_into_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_posts_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_posts_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_reactions: {
        Row: {
          created_at: string;
          target_id: string;
          target_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          target_id: string;
          target_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          target_id?: string;
          target_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_source_chat_state: {
        Row: {
          cursor: string;
          forwarded: number;
          id: number;
          scanned: number;
          updated_at: string;
        };
        Insert: {
          cursor: string;
          forwarded?: number;
          id?: number;
          scanned?: number;
          updated_at?: string;
        };
        Update: {
          cursor?: string;
          forwarded?: number;
          id?: number;
          scanned?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      mod_feedback_status_changes: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status_id: string | null;
          id: string;
          message: string | null;
          notified: boolean;
          origin: string;
          post_id: string;
          to_status_id: string | null;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status_id?: string | null;
          id?: string;
          message?: string | null;
          notified?: boolean;
          origin?: string;
          post_id: string;
          to_status_id?: string | null;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status_id?: string | null;
          id?: string;
          message?: string | null;
          notified?: boolean;
          origin?: string;
          post_id?: string;
          to_status_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_status_changes_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_status_changes_from_status_id_fkey";
            columns: ["from_status_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_statuses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_status_changes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_status_changes_to_status_id_fkey";
            columns: ["to_status_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_statuses: {
        Row: {
          archived: boolean;
          id: string;
          is_default: boolean;
          name: string;
          notify_by_default: boolean;
          position: number;
          show_on_roadmap: boolean;
          tone: string;
          type: string;
        };
        Insert: {
          archived?: boolean;
          id: string;
          is_default?: boolean;
          name: string;
          notify_by_default?: boolean;
          position?: number;
          show_on_roadmap?: boolean;
          tone?: string;
          type: string;
        };
        Update: {
          archived?: boolean;
          id?: string;
          is_default?: boolean;
          name?: string;
          notify_by_default?: boolean;
          position?: number;
          show_on_roadmap?: boolean;
          tone?: string;
          type?: string;
        };
        Relationships: [];
      };
      mod_feedback_subscriptions: {
        Row: {
          created_at: string;
          post_id: string;
          reason: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          reason?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_subscriptions_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_sync_outbox: {
        Row: {
          attempts: number;
          created_at: string;
          desired_stage: string;
          done_at: string | null;
          id: number;
          last_error: string | null;
          link_id: string;
          next_attempt_at: string;
          provider: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          desired_stage: string;
          done_at?: string | null;
          id?: never;
          last_error?: string | null;
          link_id: string;
          next_attempt_at?: string;
          provider: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          desired_stage?: string;
          done_at?: string | null;
          id?: never;
          last_error?: string | null;
          link_id?: string;
          next_attempt_at?: string;
          provider?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_sync_outbox_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_issue_links";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_feedback_tags: {
        Row: {
          archived: boolean;
          id: string;
          name: string;
          position: number;
          tone: string;
        };
        Insert: {
          archived?: boolean;
          id: string;
          name: string;
          position?: number;
          tone?: string;
        };
        Update: {
          archived?: boolean;
          id?: string;
          name?: string;
          position?: number;
          tone?: string;
        };
        Relationships: [];
      };
      mod_feedback_votes: {
        Row: {
          created_at: string;
          created_by: string | null;
          merged_from: string | null;
          post_id: string;
          priority: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          merged_from?: string | null;
          post_id: string;
          priority?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          merged_from?: string | null;
          post_id?: string;
          priority?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_feedback_votes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_votes_merged_from_fkey";
            columns: ["merged_from"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_votes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "mod_feedback_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_feedback_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_notifications: {
        Row: {
          actor_id: string | null;
          body: string | null;
          category: string | null;
          channels: string[] | null;
          created_at: string;
          data: Json;
          dedupe_key: string | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          payload: Json;
          read_at: string | null;
          source_module: string | null;
          title: string | null;
          type: string;
          url: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          body?: string | null;
          category?: string | null;
          channels?: string[] | null;
          created_at?: string;
          data?: Json;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          payload?: Json;
          read_at?: string | null;
          source_module?: string | null;
          title?: string | null;
          type: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          body?: string | null;
          category?: string | null;
          channels?: string[] | null;
          created_at?: string;
          data?: Json;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          payload?: Json;
          read_at?: string | null;
          source_module?: string | null;
          title?: string | null;
          type?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mod_notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_notifications_categories: {
        Row: {
          audience: string;
          created_at: string;
          default_channels: string[];
          description: string | null;
          key: string;
          label: string;
          module: string;
          transactional: boolean;
          updated_at: string;
        };
        Insert: {
          audience?: string;
          created_at?: string;
          default_channels?: string[];
          description?: string | null;
          key: string;
          label: string;
          module: string;
          transactional?: boolean;
          updated_at?: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          default_channels?: string[];
          description?: string | null;
          key?: string;
          label?: string;
          module?: string;
          transactional?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      mod_notifications_push_tickets: {
        Row: {
          created_at: string;
          id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          token: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          token?: string;
        };
        Relationships: [];
      };
      mod_notifications_push_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_notifications_push_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_reminders: {
        Row: {
          attempts: number;
          channel: string;
          claimed_at: string | null;
          created_at: string;
          due_at: string;
          id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          channel?: string;
          claimed_at?: string | null;
          created_at?: string;
          due_at: string;
          id?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          channel?: string;
          claimed_at?: string | null;
          created_at?: string;
          due_at?: string;
          id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mod_reminders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          allowed_domains: string[];
          created_at: string;
          data: Json;
          id: string;
          join_link_enabled: boolean;
          join_token_hash: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
        };
        Insert: {
          allowed_domains?: string[];
          created_at?: string;
          data?: Json;
          id?: string;
          join_link_enabled?: boolean;
          join_token_hash?: string | null;
          logo_url?: string | null;
          name: string;
          owner_id: string;
          slug?: string;
        };
        Update: {
          allowed_domains?: string[];
          created_at?: string;
          data?: Json;
          id?: string;
          join_link_enabled?: boolean;
          join_token_hash?: string | null;
          logo_url?: string | null;
          name?: string;
          owner_id?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          email_preferences: Json;
          id: string;
          is_anonymous: boolean;
          is_staff: boolean;
          last_org_id: string | null;
          phone: string | null;
          title: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          email_preferences?: Json;
          id: string;
          is_anonymous?: boolean;
          is_staff?: boolean;
          last_org_id?: string | null;
          phone?: string | null;
          title?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          email_preferences?: Json;
          id?: string;
          is_anonymous?: boolean;
          is_staff?: boolean;
          last_org_id?: string | null;
          phone?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_last_org_id_fkey";
            columns: ["last_org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          is_system: boolean;
          name: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          name: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      user_tags: {
        Row: {
          created_at: string;
          id: string;
          tag_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          tag_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          tag_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_tags_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { _token: string };
        Returns: {
          allowed_domains: string[];
          created_at: string;
          data: Json;
          id: string;
          join_link_enabled: boolean;
          join_token_hash: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accept_pending_invitation: {
        Args: { _invitation_id: string };
        Returns: {
          allowed_domains: string[];
          created_at: string;
          data: Json;
          id: string;
          join_link_enabled: boolean;
          join_token_hash: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_invitation: {
        Args: { _inv: Database["public"]["Tables"]["invitations"]["Row"] };
        Returns: {
          allowed_domains: string[];
          created_at: string;
          data: Json;
          id: string;
          join_link_enabled: boolean;
          join_token_hash: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
        };
        SetofOptions: {
          from: "invitations";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      audit_log_event: {
        Args: {
          _action: string;
          _actor_id?: string;
          _actor_type?: string;
          _entity_id?: string;
          _entity_type?: string;
          _meta?: Json;
          _org_id?: string;
        };
        Returns: number;
      };
      blocking_owned_workspaces: {
        Args: { _user: string };
        Returns: {
          member_count: number;
          org_id: string;
          org_name: string;
        }[];
      };
      check_invitation_for_caller: {
        Args: { _inv: Database["public"]["Tables"]["invitations"]["Row"] };
        Returns: undefined;
      };
      cms_user_sync_ack: { Args: { _msg_ids: number[] }; Returns: number };
      cms_user_sync_enqueue_all: { Args: never; Returns: number };
      cms_user_sync_read: {
        Args: { _n?: number; _vt?: number };
        Returns: {
          msg_id: number;
          read_ct: number;
          user_id: string;
        }[];
      };
      confirmed_email: { Args: never; Returns: string };
      create_invitations: {
        Args: {
          _emails: string[];
          _expires_days?: number;
          _org: string;
          _role?: string;
        };
        Returns: {
          invitation_id: string;
          invite_email: string;
          invite_token: string;
          result: string;
        }[];
      };
      create_workspace: {
        Args: { _name: string; _slug: string };
        Returns: {
          allowed_domains: string[];
          created_at: string;
          data: Json;
          id: string;
          join_link_enabled: boolean;
          join_token_hash: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      invitation_preview: {
        Args: { _token: string };
        Returns: {
          email: string;
          expires_at: string;
          inviter_name: string;
          logo_url: string;
          org_name: string;
          org_slug: string;
          role: string;
          status: string;
        }[];
      };
      is_anonymous_session: { Args: never; Returns: boolean };
      is_free_mail_domain: { Args: { _domain: string }; Returns: boolean };
      is_org_admin: { Args: { _org: string }; Returns: boolean };
      is_org_member: { Args: { _org: string }; Returns: boolean };
      is_org_owner: { Args: { _org: string }; Returns: boolean };
      is_reserved_slug: { Args: { _slug: string }; Returns: boolean };
      is_slug_available: { Args: { _slug: string }; Returns: boolean };
      join_link_preview: {
        Args: { _token: string };
        Returns: {
          allowed_domains: string[];
          logo_url: string;
          org_name: string;
          org_slug: string;
          status: string;
        }[];
      };
      join_workspace_by_link: {
        Args: { _token: string };
        Returns: {
          allowed_domains: string[];
          created_at: string;
          data: Json;
          id: string;
          join_link_enabled: boolean;
          join_token_hash: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      kit_merge_anon_data: {
        Args: { _from: string; _to: string };
        Returns: Json;
      };
      kit_register_anon_data: {
        Args: { _has_data_fn: string; _merge_fn: string; _module: string };
        Returns: undefined;
      };
      kit_register_app_schedule: {
        Args: { _cron: string; _name: string; _path: string };
        Returns: undefined;
      };
      kit_register_housekeeping: {
        Args: { _fn: string; _module: string };
        Returns: undefined;
      };
      kit_register_retention: {
        Args: { _class: string; _description?: string; _keep_days: number };
        Returns: undefined;
      };
      kit_scheduler_status: { Args: never; Returns: Json };
      kit_set_embed_origins: {
        Args: { _module: string; _origins: string[] };
        Returns: undefined;
      };
      kit_unregister_anon_data: {
        Args: { _module: string };
        Returns: undefined;
      };
      kit_unregister_app_schedule: {
        Args: { _name: string };
        Returns: undefined;
      };
      kit_unregister_housekeeping: {
        Args: { _module: string };
        Returns: undefined;
      };
      mod_billing_apply_subscription: {
        Args: { _event_at: string; _row: Json };
        Returns: boolean;
      };
      mod_billing_claim_webhook_event: {
        Args: { _id: string; _type: string };
        Returns: string;
      };
      mod_billing_purge: { Args: never; Returns: number };
      mod_billing_set_webhook_secret: {
        Args: { _secret: string };
        Returns: undefined;
      };
      mod_billing_user_id_by_email: {
        Args: { _email: string };
        Returns: string;
      };
      mod_billing_webhook_secret: { Args: never; Returns: string };
      mod_feedback_anon_has_data: { Args: { _user: string }; Returns: boolean };
      mod_feedback_board_counts: {
        Args: never;
        Returns: {
          board_id: string;
          post_count: number;
        }[];
      };
      mod_feedback_changelog_likes: {
        Args: { _entries: string[] };
        Returns: {
          entry_id: string;
          likes: number;
          mine: boolean;
        }[];
      };
      mod_feedback_changelog_reader_count: {
        Args: { _since: string };
        Returns: number;
      };
      mod_feedback_idea_voter_stats: {
        Args: { _ideas: string[] };
        Returns: {
          idea_id: string;
          important: number;
          must: number;
          nice: number;
          tags: Json;
          voters: number;
        }[];
      };
      mod_feedback_insights: {
        Args: { _board?: string; _since: string };
        Returns: Json;
      };
      mod_feedback_is_anon: { Args: never; Returns: boolean };
      mod_feedback_is_service: { Args: never; Returns: boolean };
      mod_feedback_is_staff: { Args: never; Returns: boolean };
      mod_feedback_link_post: {
        Args: { _idea?: string; _post: string };
        Returns: string;
      };
      mod_feedback_list_posts: {
        Args: {
          _board?: string;
          _limit?: number;
          _offset?: number;
          _q?: string;
          _sort?: string;
          _statuses?: string[];
        };
        Returns: {
          ai_processed_at: string | null;
          approval_state: string;
          attachments: Json;
          author_id: string | null;
          board_id: string;
          category_id: string | null;
          comment_count: number;
          created_at: string;
          custom_fields: Json;
          deleted_at: string | null;
          details: string;
          embedding: string | null;
          eta: string | null;
          eta_public: boolean;
          id: string;
          idea_id: string | null;
          merged_into_id: string | null;
          owner_id: string | null;
          pinned: boolean;
          search: unknown;
          slug: string;
          source: string;
          source_ref: Json;
          status_changed_at: string;
          status_id: string | null;
          summary: string | null;
          summary_comment_count: number | null;
          title: string;
          trend_at: string;
          trend_score: number;
          updated_at: string;
          vote_count: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "mod_feedback_posts";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      mod_feedback_merge_anon: {
        Args: { _from: string; _to: string };
        Returns: undefined;
      };
      mod_feedback_merge_posts: {
        Args: { _source: string; _target: string };
        Returns: string;
      };
      mod_feedback_people: {
        Args: { _ids: string[] };
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
          is_staff: boolean;
        }[];
      };
      mod_feedback_post_voters: {
        Args: { _limit?: number; _post: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          priority: string;
          total: number;
          user_id: string;
        }[];
      };
      mod_feedback_reaction_counts: {
        Args: { _ids: string[] };
        Returns: {
          likes: number;
          mine: boolean;
          target_id: string;
        }[];
      };
      mod_feedback_readable_board_ids: { Args: never; Returns: string[] };
      mod_feedback_register_provider: {
        Args: {
          _capabilities?: Json;
          _label: string;
          _provider: string;
          _route_base: string;
        };
        Returns: undefined;
      };
      mod_feedback_require_staff: { Args: never; Returns: undefined };
      mod_feedback_set_idea_stage: {
        Args: {
          _actor?: string;
          _idea: string;
          _message?: string;
          _notify?: boolean;
          _origin?: string;
          _stage: string;
        };
        Returns: {
          change_id: string;
          notified: boolean;
          post_id: string;
        }[];
      };
      mod_feedback_set_status: {
        Args: {
          _actor?: string;
          _message?: string;
          _notify?: boolean;
          _origin?: string;
          _post: string;
          _status: string;
        };
        Returns: string;
      };
      mod_feedback_similar_by_embedding: {
        Args: {
          _board?: string;
          _embedding: string;
          _exclude?: string;
          _limit?: number;
        };
        Returns: {
          board_id: string;
          comment_count: number;
          details: string;
          id: string;
          similarity: number;
          slug: string;
          status_id: string;
          title: string;
          vote_count: number;
        }[];
      };
      mod_feedback_similar_posts: {
        Args: { _board?: string; _limit?: number; _q: string };
        Returns: {
          board_id: string;
          comment_count: number;
          details: string;
          id: string;
          score: number;
          slug: string;
          status_id: string;
          title: string;
          vote_count: number;
        }[];
      };
      mod_feedback_slugify: { Args: { _text: string }; Returns: string };
      mod_feedback_unmerge_post: {
        Args: { _source: string };
        Returns: undefined;
      };
      mod_feedback_unregister_provider: {
        Args: { _provider: string };
        Returns: undefined;
      };
      mod_notifications_audience: {
        Args: {
          _audience: string;
          _tag_names?: string[];
          _user_ids?: string[];
        };
        Returns: {
          user_id: string;
        }[];
      };
      mod_notifications_audience_tokens: {
        Args: {
          _after?: string;
          _audience: string;
          _limit?: number;
          _tag_names?: string[];
          _user_ids?: string[];
        };
        Returns: {
          id: string;
          token: string;
        }[];
      };
      mod_notifications_broadcast: {
        Args: {
          _audience?: string;
          _body?: string;
          _category: string;
          _data?: Json;
          _dedupe_key: string;
          _source_module?: string;
          _tag_names?: string[];
          _title?: string;
          _url?: string;
          _user_ids?: string[];
        };
        Returns: number;
      };
      mod_notifications_emit: {
        Args: {
          _actor?: string;
          _body?: string;
          _category: string;
          _channels?: string[];
          _data?: Json;
          _dedupe_key?: string;
          _entity_id?: string;
          _entity_type?: string;
          _payload?: Json;
          _source_module?: string;
          _title?: string;
          _url?: string;
          _user: string;
        };
        Returns: string;
      };
      mod_notifications_mark_all_read: { Args: never; Returns: number };
      mod_notifications_register_category: {
        Args: {
          _audience?: string;
          _default_channels?: string[];
          _description?: string;
          _key: string;
          _label: string;
          _module: string;
          _transactional?: boolean;
        };
        Returns: undefined;
      };
      mod_notifications_register_push_token: {
        Args: { _platform: string; _token: string };
        Returns: undefined;
      };
      mod_notifications_unread_count: { Args: never; Returns: number };
      mod_notifications_unregister_module: {
        Args: { _module: string };
        Returns: undefined;
      };
      mod_notifications_unregister_push_token: {
        Args: { _token: string };
        Returns: undefined;
      };
      mod_reminders_claim: {
        Args: { _limit?: number; _stale_after?: string };
        Returns: {
          attempts: number;
          channel: string;
          id: string;
          user_id: string;
        }[];
      };
      my_blocking_workspaces: {
        Args: never;
        Returns: {
          member_count: number;
          org_id: string;
          org_name: string;
        }[];
      };
      my_pending_invitations: {
        Args: never;
        Returns: {
          expires_at: string;
          invitation_id: string;
          inviter_name: string;
          logo_url: string;
          org_id: string;
          org_name: string;
          org_slug: string;
          role: string;
        }[];
      };
      new_url_token: { Args: never; Returns: string };
      resend_invitation: {
        Args: { _expires_days?: number; _invitation_id: string };
        Returns: {
          invite_email: string;
          invite_token: string;
        }[];
      };
      reset_join_link: { Args: { _org: string }; Returns: string };
      save_onboarding_progress: {
        Args: {
          _completed?: boolean;
          _done?: string;
          _org_id: string;
          _step: string;
        };
        Returns: undefined;
      };
      set_join_link: {
        Args: { _allowed_domains?: string[]; _enabled: boolean; _org: string };
        Returns: undefined;
      };
      sha256_hex: { Args: { _value: string }; Returns: string };
      workspace_members: {
        Args: { _after?: string; _limit?: number; _org: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          email: string;
          is_you: boolean;
          joined_at: string;
          role: string;
          title: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
