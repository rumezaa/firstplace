/**
 * Hand-written to match supabase/migrations. Regenerate once the Supabase CLI
 * is linked:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Until then, if you change a migration, change this file too.
 *
 * Note on Insert/Update: these describe what the TYPES allow, not what RLS
 * allows. Most tables here are read-only from the client and are written
 * through the RPCs in migration 0400. The policies are the real gate.
 */

export type VenueType = 'cafe' | 'study' | 'other';
export type TableStatus = 'open' | 'taken';
export type RewardType = 'frequent' | 'passport';
export type RewardStatus = 'in_progress' | 'earned' | 'redeemed';

/** Matches the CASE expression in public.venue_live. */
export type Availability = 'open' | 'filling_up' | 'full';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          interests: string[];
          vibe_tags: string[];
          incognito: boolean;
          familiar_faces_opt_in: boolean;
          share_overlap: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          interests?: string[];
          vibe_tags?: string[];
          incognito?: boolean;
          familiar_faces_opt_in?: boolean;
          share_overlap?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          interests?: string[];
          vibe_tags?: string[];
          incognito?: boolean;
          familiar_faces_opt_in?: boolean;
          share_overlap?: boolean;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          name: string;
          lat: number;
          lng: number;
          type: VenueType;
          address: string | null;
          insider_info: string | null;
          popular_drinks: string[];
          vibe_summary: string | null;
          is_quiet: boolean;
          good_for_groups: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          lat: number;
          lng: number;
          type?: VenueType;
          address?: string | null;
          insider_info?: string | null;
          popular_drinks?: string[];
          vibe_summary?: string | null;
          is_quiet?: boolean;
          good_for_groups?: boolean;
        };
        Update: {
          name?: string;
          lat?: number;
          lng?: number;
          type?: VenueType;
          address?: string | null;
          insider_info?: string | null;
          popular_drinks?: string[];
          vibe_summary?: string | null;
          is_quiet?: boolean;
          good_for_groups?: boolean;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          id: string;
          venue_id: string;
          label: string;
          seats: number;
          status: TableStatus;
          is_chat_table: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          label: string;
          seats?: number;
          status?: TableStatus;
          is_chat_table?: boolean;
        };
        Update: {
          label?: string;
          seats?: number;
          status?: TableStatus;
          is_chat_table?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'tables_venue_id_fkey';
            columns: ['venue_id'];
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      checkins: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string;
          table_id: string | null;
          open_to_chat: boolean;
          checked_in_at: string;
          checked_out_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          venue_id: string;
          table_id?: string | null;
          open_to_chat?: boolean;
          checked_in_at?: string;
          checked_out_at?: string | null;
        };
        Update: {
          open_to_chat?: boolean;
          checked_out_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'checkins_venue_id_fkey';
            columns: ['venue_id'];
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'checkins_table_id_fkey';
            columns: ['table_id'];
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
        ];
      };
      kiosk_codes: {
        // RLS has no select policy for this table on purpose: if clients could
        // read it, anyone could check in to any cafe from home.
        Row: { id: string; venue_id: string; code: string; expires_at: string; created_at: string };
        Insert: { id?: string; venue_id: string; code: string; expires_at: string };
        Update: { expires_at?: string };
        Relationships: [];
      };
      familiar_faces: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          venue_id: string;
          overlap_count: number;
          a_accepted: boolean;
          b_accepted: boolean;
          common_weekday: number | null;
          last_overlap_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_a: string;
          user_b: string;
          venue_id: string;
          overlap_count?: number;
          a_accepted?: boolean;
          b_accepted?: boolean;
          common_weekday?: number | null;
          last_overlap_at?: string | null;
        };
        Update: { a_accepted?: boolean; b_accepted?: boolean };
        Relationships: [];
      };
      rewards: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string | null;
          type: RewardType;
          progress: number;
          status: RewardStatus;
        };
        Insert: {
          id?: string;
          user_id: string;
          venue_id?: string | null;
          type: RewardType;
          progress?: number;
          status?: RewardStatus;
        };
        Update: { progress?: number; status?: RewardStatus };
        Relationships: [];
      };
    };
    Views: {
      venue_live: {
        Row: {
          venue_id: string;
          total_tables: number;
          open_tables: number;
          has_chat_table: boolean;
          chat_table_open: boolean;
          people_open_to_chat: number;
          chat_table_active: boolean;
          availability: Availability;
        };
        Relationships: [];
      };
      venue_busy_hours: {
        Row: { venue_id: string; hour_of_day: number; visits: number };
        Relationships: [];
      };
      venue_crowd_tags: {
        Row: { venue_id: string; tag: string; people: number };
        Relationships: [];
      };
    };
    Functions: {
      check_in: {
        Args: { p_code: string; p_table_id: string; p_open_to_chat?: boolean };
        Returns: Json;
      };
      check_out: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      auto_checkout_stale: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      rotate_kiosk_code: {
        Args: { p_venue_id: string; p_ttl_seconds?: number };
        Returns: Json;
      };
      venue_dashboard: {
        Args: { p_venue_id: string; p_days?: number };
        Returns: Json;
      };
      my_familiar_faces: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          venue_id: string;
          venue_name: string;
          overlap_count: number;
          common_weekday: number | null;
          last_overlap_at: string | null;
          i_accepted: boolean;
          they_accepted: boolean;
          mutual: boolean;
          their_first_name: string | null;
        }[];
      };
      respond_to_familiar_face: {
        Args: { p_id: string; p_accept: boolean };
        Returns: Json;
      };
      recompute_rewards: {
        Args: { p_user_id?: string };
        Returns: number;
      };
      session_length: { Args: Record<PropertyKey, never>; Returns: unknown };
      dashboard_min_group_size: { Args: Record<PropertyKey, never>; Returns: number };
    };
    Enums: {
      venue_type: VenueType;
      table_status: TableStatus;
      reward_type: RewardType;
      reward_status: RewardStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type UserProfile = Database['public']['Tables']['users']['Row'];
/** The subset of a profile the client is allowed to change. */
export type UserProfileUpdate = Database['public']['Tables']['users']['Update'];
export type Venue = Database['public']['Tables']['venues']['Row'];
export type VenueTable = Database['public']['Tables']['tables']['Row'];
export type Checkin = Database['public']['Tables']['checkins']['Row'];
export type Reward = Database['public']['Tables']['rewards']['Row'];
export type VenueLive = Database['public']['Views']['venue_live']['Row'];
export type BusyHour = Database['public']['Views']['venue_busy_hours']['Row'];
export type CrowdTag = Database['public']['Views']['venue_crowd_tags']['Row'];
export type FamiliarFaceCard =
  Database['public']['Functions']['my_familiar_faces']['Returns'][number];
