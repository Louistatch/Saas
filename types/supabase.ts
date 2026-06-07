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
      ai_conversations: {
        Row: {
          card_number: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          card_number: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          card_number?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: []
      }
      buyer_matches: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          match_reason: string | null
          match_score: number
          request_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          match_reason?: string | null
          match_score: number
          request_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          match_reason?: string | null
          match_score?: number
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_matches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_matches_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "buyer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_requests: {
        Row: {
          buyer_email: string | null
          buyer_name: string
          buyer_phone: string | null
          cooperative_id: string | null
          created_at: string | null
          culture: string
          id: string
          location_prefecture: string | null
          max_price_per_kg_fcfa: number | null
          needed_by: string | null
          notes: string | null
          quality_grade_min: string | null
          quantity_kg_needed: number
          status: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_name: string
          buyer_phone?: string | null
          cooperative_id?: string | null
          created_at?: string | null
          culture: string
          id?: string
          location_prefecture?: string | null
          max_price_per_kg_fcfa?: number | null
          needed_by?: string | null
          notes?: string | null
          quality_grade_min?: string | null
          quantity_kg_needed: number
          status?: string
        }
        Update: {
          buyer_email?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          cooperative_id?: string | null
          created_at?: string | null
          culture?: string
          id?: string
          location_prefecture?: string | null
          max_price_per_kg_fcfa?: number | null
          needed_by?: string | null
          notes?: string | null
          quality_grade_min?: string | null
          quantity_kg_needed?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_requests_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      campagnes: {
        Row: {
          cooperative_id: string
          created_at: string | null
          culture: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          target_yield_kg: number | null
        }
        Insert: {
          cooperative_id: string
          created_at?: string | null
          culture: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          target_yield_kg?: number | null
        }
        Update: {
          cooperative_id?: string
          created_at?: string | null
          culture?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          target_yield_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campagnes_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      cantons: {
        Row: {
          commune_id: string | null
          created_at: string
          id: string
          name: string
          prefecture_id: string
        }
        Insert: {
          commune_id?: string | null
          created_at?: string
          id?: string
          name: string
          prefecture_id: string
        }
        Update: {
          commune_id?: string | null
          created_at?: string
          id?: string
          name?: string
          prefecture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cantons_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantons_prefecture_id_fkey"
            columns: ["prefecture_id"]
            isOneToOne: false
            referencedRelation: "prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      communes: {
        Row: {
          created_at: string
          id: string
          name: string
          prefecture_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          prefecture_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          prefecture_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communes_prefecture_id_fkey"
            columns: ["prefecture_id"]
            isOneToOne: false
            referencedRelation: "prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      cooperative_settings: {
        Row: {
          card_settings: Json
          card_template: Json
          cooperative_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          card_settings?: Json
          card_template?: Json
          cooperative_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          card_settings?: Json
          card_template?: Json
          cooperative_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooperative_settings_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: true
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      cooperatives: {
        Row: {
          coordo_name: string | null
          coordo_phone: string | null
          created_at: string | null
          culture_categories: Json | null
          description: string | null
          faitiere_name: string | null
          id: string
          level: string | null
          logo_url: string | null
          name: string
          parent_id: string | null
          primary_color: string | null
          updated_at: string | null
          village_id: string | null
        }
        Insert: {
          coordo_name?: string | null
          coordo_phone?: string | null
          created_at?: string | null
          culture_categories?: Json | null
          description?: string | null
          faitiere_name?: string | null
          id?: string
          level?: string | null
          logo_url?: string | null
          name: string
          parent_id?: string | null
          primary_color?: string | null
          updated_at?: string | null
          village_id?: string | null
        }
        Update: {
          coordo_name?: string | null
          coordo_phone?: string | null
          created_at?: string | null
          culture_categories?: Json | null
          description?: string | null
          faitiere_name?: string | null
          id?: string
          level?: string | null
          logo_url?: string | null
          name?: string
          parent_id?: string | null
          primary_color?: string | null
          updated_at?: string | null
          village_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cooperatives_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      cotisations: {
        Row: {
          amount: number | null
          campaign: string | null
          cooperative_id: string
          created_at: string
          currency: string | null
          due_date: string | null
          id: string
          member_id: string
          notes: string | null
          paid_date: string | null
          status: string
          type: string | null
        }
        Insert: {
          amount?: number | null
          campaign?: string | null
          cooperative_id: string
          created_at?: string
          currency?: string | null
          due_date?: string | null
          id?: string
          member_id: string
          notes?: string | null
          paid_date?: string | null
          status?: string
          type?: string | null
        }
        Update: {
          amount?: number | null
          campaign?: string | null
          cooperative_id?: string
          created_at?: string
          currency?: string | null
          due_date?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotisations_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotisations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      cultures: {
        Row: {
          category: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      fiches_techniques: {
        Row: {
          campaign: string | null
          canton_id: string | null
          cooperative_id: string
          created_at: string
          culture: string
          currency: string
          description: string | null
          download_count: number
          files: Json
          id: string
          is_free_for_members: boolean
          prefecture_id: string | null
          price_non_member: number
          region_id: string | null
          status: string
          title: string
          type_agriculture: string | null
          updated_at: string
        }
        Insert: {
          campaign?: string | null
          canton_id?: string | null
          cooperative_id: string
          created_at?: string
          culture: string
          currency?: string
          description?: string | null
          download_count?: number
          files?: Json
          id?: string
          is_free_for_members?: boolean
          prefecture_id?: string | null
          price_non_member?: number
          region_id?: string | null
          status?: string
          title: string
          type_agriculture?: string | null
          updated_at?: string
        }
        Update: {
          campaign?: string | null
          canton_id?: string | null
          cooperative_id?: string
          created_at?: string
          culture?: string
          currency?: string
          description?: string | null
          download_count?: number
          files?: Json
          id?: string
          is_free_for_members?: boolean
          prefecture_id?: string | null
          price_non_member?: number
          region_id?: string | null
          status?: string
          title?: string
          type_agriculture?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiches_techniques_canton_id_fkey"
            columns: ["canton_id"]
            isOneToOne: false
            referencedRelation: "cantons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiches_techniques_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiches_techniques_prefecture_id_fkey"
            columns: ["prefecture_id"]
            isOneToOne: false
            referencedRelation: "prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiches_techniques_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          cooperative_id: string
          created_at: string | null
          id: string
          last_sync_at: string | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          cooperative_id: string
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          cooperative_id?: string
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      intrants: {
        Row: {
          campagne_id: string | null
          cooperative_id: string
          cost_fcfa: number | null
          created_at: string | null
          id: string
          member_id: string
          name: string
          purchase_date: string | null
          quantity: number
          supplier: string | null
          type: string
          unit: string
        }
        Insert: {
          campagne_id?: string | null
          cooperative_id: string
          cost_fcfa?: number | null
          created_at?: string | null
          id?: string
          member_id: string
          name: string
          purchase_date?: string | null
          quantity: number
          supplier?: string | null
          type: string
          unit: string
        }
        Update: {
          campagne_id?: string | null
          cooperative_id?: string
          cost_fcfa?: number | null
          created_at?: string | null
          id?: string
          member_id?: string
          name?: string
          purchase_date?: string | null
          quantity?: number
          supplier?: string | null
          type?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "intrants_campagne_id_fkey"
            columns: ["campagne_id"]
            isOneToOne: false
            referencedRelation: "campagnes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intrants_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intrants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          body: string | null
          campagne_id: string | null
          cooperative_id: string
          cost_fcfa: number | null
          created_at: string | null
          entry_date: string
          id: string
          member_id: string
          parcelle_id: string | null
          photo_url: string | null
          quantity: number | null
          title: string
          type: string
          unit: string | null
        }
        Insert: {
          body?: string | null
          campagne_id?: string | null
          cooperative_id: string
          cost_fcfa?: number | null
          created_at?: string | null
          entry_date?: string
          id?: string
          member_id: string
          parcelle_id?: string | null
          photo_url?: string | null
          quantity?: number | null
          title: string
          type: string
          unit?: string | null
        }
        Update: {
          body?: string | null
          campagne_id?: string | null
          cooperative_id?: string
          cost_fcfa?: number | null
          created_at?: string | null
          entry_date?: string
          id?: string
          member_id?: string
          parcelle_id?: string | null
          photo_url?: string | null
          quantity?: number | null
          title?: string
          type?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_campagne_id_fkey"
            columns: ["campagne_id"]
            isOneToOne: false
            referencedRelation: "campagnes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_field_mappings: {
        Row: {
          cooperative_id: string
          created_at: string
          form_id: string
          id: string
          is_key_field: boolean
          kobo_field: string
          target_column: string
          target_table: string
          transform_fn: string | null
        }
        Insert: {
          cooperative_id: string
          created_at?: string
          form_id: string
          id?: string
          is_key_field?: boolean
          kobo_field: string
          target_column: string
          target_table: string
          transform_fn?: string | null
        }
        Update: {
          cooperative_id?: string
          created_at?: string
          form_id?: string
          id?: string
          is_key_field?: boolean
          kobo_field?: string
          target_column?: string
          target_table?: string
          transform_fn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kobo_field_mappings_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_submissions: {
        Row: {
          cooperative_id: string
          created_at: string
          error_message: string | null
          id: string
          kobo_form_id: string
          kobo_instance_id: string
          matched_at: string | null
          member_card_number: string | null
          member_id: string | null
          processed_at: string | null
          processed_payload: Json | null
          raw_payload: Json | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          cooperative_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          kobo_form_id: string
          kobo_instance_id: string
          matched_at?: string | null
          member_card_number?: string | null
          member_id?: string | null
          processed_at?: string | null
          processed_payload?: Json | null
          raw_payload?: Json | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          cooperative_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          kobo_form_id?: string
          kobo_instance_id?: string
          matched_at?: string | null
          member_card_number?: string | null
          member_id?: string | null
          processed_at?: string | null
          processed_payload?: Json | null
          raw_payload?: Json | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kobo_submissions_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kobo_submissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_sync_logs: {
        Row: {
          completed_at: string | null
          cooperative_id: string | null
          details: Json | null
          duration_ms: number | null
          error_details: Json | null
          id: string
          integration_id: string | null
          started_at: string
          status: string
          submissions_errors: number | null
          submissions_matched: number | null
          submissions_processed: number | null
          submissions_received: number | null
          sync_type: string | null
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          cooperative_id?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          integration_id?: string | null
          started_at?: string
          status?: string
          submissions_errors?: number | null
          submissions_matched?: number | null
          submissions_processed?: number | null
          submissions_received?: number | null
          sync_type?: string | null
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          cooperative_id?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          integration_id?: string | null
          started_at?: string
          status?: string
          submissions_errors?: number | null
          submissions_matched?: number | null
          submissions_processed?: number | null
          submissions_received?: number | null
          sync_type?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kobo_sync_logs_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kobo_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listings: {
        Row: {
          contact_count: number | null
          cooperative_id: string
          created_at: string | null
          culture: string
          description: string | null
          expires_at: string | null
          harvest_date_estimated: string | null
          id: string
          location_canton: string | null
          location_prefecture: string | null
          member_id: string
          price_per_kg_fcfa: number
          quality_grade: string | null
          quantity_kg: number
          status: string
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          contact_count?: number | null
          cooperative_id: string
          created_at?: string | null
          culture: string
          description?: string | null
          expires_at?: string | null
          harvest_date_estimated?: string | null
          id?: string
          location_canton?: string | null
          location_prefecture?: string | null
          member_id: string
          price_per_kg_fcfa: number
          quality_grade?: string | null
          quantity_kg: number
          status?: string
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          contact_count?: number | null
          cooperative_id?: string
          created_at?: string | null
          culture?: string
          description?: string | null
          expires_at?: string | null
          harvest_date_estimated?: string | null
          id?: string
          location_canton?: string | null
          location_prefecture?: string | null
          member_id?: string
          price_per_kg_fcfa?: number
          quality_grade?: string | null
          quantity_kg?: number
          status?: string
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      market_prices: {
        Row: {
          canton_id: string | null
          cooperative_id: string | null
          created_at: string
          culture_id: string
          currency: string
          id: string
          market_name: string
          price: number
          region_id: string
          reported_by: string | null
          source: string | null
          trend: string | null
          unit: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          canton_id?: string | null
          cooperative_id?: string | null
          created_at?: string
          culture_id: string
          currency?: string
          id?: string
          market_name: string
          price: number
          region_id: string
          reported_by?: string | null
          source?: string | null
          trend?: string | null
          unit?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          canton_id?: string | null
          cooperative_id?: string | null
          created_at?: string
          culture_id?: string
          currency?: string
          id?: string
          market_name?: string
          price?: number
          region_id?: string
          reported_by?: string | null
          source?: string | null
          trend?: string | null
          unit?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "market_prices_canton_id_fkey"
            columns: ["canton_id"]
            isOneToOne: false
            referencedRelation: "cantons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_prices_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_prices_culture_id_fkey"
            columns: ["culture_id"]
            isOneToOne: false
            referencedRelation: "cultures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_prices_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_products: {
        Row: {
          available: boolean
          category: string | null
          certification: string[] | null
          cooperative_id: string | null
          created_at: string
          culture: string | null
          currency: string
          description: string | null
          id: string
          images: Json
          name: string
          orders_count: number
          prefecture_id: string | null
          price: number | null
          producer_type: string | null
          quantity_available: number | null
          region_id: string | null
          season: string | null
          unit: string | null
          views_count: number
        }
        Insert: {
          available?: boolean
          category?: string | null
          certification?: string[] | null
          cooperative_id?: string | null
          created_at?: string
          culture?: string | null
          currency?: string
          description?: string | null
          id?: string
          images?: Json
          name: string
          orders_count?: number
          prefecture_id?: string | null
          price?: number | null
          producer_type?: string | null
          quantity_available?: number | null
          region_id?: string | null
          season?: string | null
          unit?: string | null
          views_count?: number
        }
        Update: {
          available?: boolean
          category?: string | null
          certification?: string[] | null
          cooperative_id?: string | null
          created_at?: string
          culture?: string | null
          currency?: string
          description?: string | null
          id?: string
          images?: Json
          name?: string
          orders_count?: number
          prefecture_id?: string | null
          price?: number | null
          producer_type?: string | null
          quantity_available?: number | null
          region_id?: string | null
          season?: string | null
          unit?: string | null
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_products_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_prefecture_id_fkey"
            columns: ["prefecture_id"]
            isOneToOne: false
            referencedRelation: "prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      member_access_logs: {
        Row: {
          action: string
          card_number: string | null
          cooperative_id: string | null
          created_at: string
          fiche_id: string | null
          id: number
          member_id: string | null
        }
        Insert: {
          action: string
          card_number?: string | null
          cooperative_id?: string | null
          created_at?: string
          fiche_id?: string | null
          id?: number
          member_id?: string | null
        }
        Update: {
          action?: string
          card_number?: string | null
          cooperative_id?: string | null
          created_at?: string
          fiche_id?: string | null
          id?: number
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_access_logs_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_access_logs_fiche_id_fkey"
            columns: ["fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches_techniques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_access_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_ats_scores: {
        Row: {
          anciennete_score: number | null
          calculated_at: string | null
          cooperative_id: string
          cotisation_score: number | null
          created_at: string | null
          engagement_score: number | null
          id: string
          level: string | null
          member_id: string
          parcelle_score: number | null
          production_score: number | null
          score: number
        }
        Insert: {
          anciennete_score?: number | null
          calculated_at?: string | null
          cooperative_id: string
          cotisation_score?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          level?: string | null
          member_id: string
          parcelle_score?: number | null
          production_score?: number | null
          score: number
        }
        Update: {
          anciennete_score?: number | null
          calculated_at?: string | null
          cooperative_id?: string
          cotisation_score?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          level?: string | null
          member_id?: string
          parcelle_score?: number | null
          production_score?: number | null
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_ats_scores_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_ats_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_cards: {
        Row: {
          card_number: string
          card_type: string
          cooperative_id: string
          created_at: string | null
          expiry_date: string | null
          id: string
          member_id: string
          qr_data: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          card_number: string
          card_type?: string
          cooperative_id: string
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          member_id: string
          qr_data?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          card_number?: string
          card_type?: string
          cooperative_id?: string
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          member_id?: string
          qr_data?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_cards_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_cards_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          address: string | null
          canton: string | null
          canton_id: string | null
          cooperative_id: string
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          faitiere: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          photo_url: string | null
          prefecture: string | null
          prefecture_id: string | null
          region: string | null
          region_id: string | null
          signature_url: string | null
          status: string
          updated_at: string | null
          village: string | null
        }
        Insert: {
          address?: string | null
          canton?: string | null
          canton_id?: string | null
          cooperative_id: string
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          faitiere?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          photo_url?: string | null
          prefecture?: string | null
          prefecture_id?: string | null
          region?: string | null
          region_id?: string | null
          signature_url?: string | null
          status?: string
          updated_at?: string | null
          village?: string | null
        }
        Update: {
          address?: string | null
          canton?: string | null
          canton_id?: string | null
          cooperative_id?: string
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          faitiere?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          photo_url?: string | null
          prefecture?: string | null
          prefecture_id?: string | null
          region?: string | null
          region_id?: string | null
          signature_url?: string | null
          status?: string
          updated_at?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_canton_id_fkey"
            columns: ["canton_id"]
            isOneToOne: false
            referencedRelation: "cantons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_prefecture_id_fkey"
            columns: ["prefecture_id"]
            isOneToOne: false
            referencedRelation: "prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number | null
          body_rendered: string | null
          channel: string
          cooperative_id: string | null
          created_at: string | null
          id: string
          last_error: string | null
          member_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          template_key: string | null
          variables: Json | null
        }
        Insert: {
          attempts?: number | null
          body_rendered?: string | null
          channel: string
          cooperative_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          member_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string | null
          variables?: Json | null
        }
        Update: {
          attempts?: number | null
          body_rendered?: string | null
          channel?: string
          cooperative_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          member_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_fr: string
          channel: string
          created_at: string | null
          id: string
          key: string
          subject: string | null
        }
        Insert: {
          body_fr: string
          channel: string
          created_at?: string | null
          id?: string
          key: string
          subject?: string | null
        }
        Update: {
          body_fr?: string
          channel?: string
          created_at?: string | null
          id?: string
          key?: string
          subject?: string | null
        }
        Relationships: []
      }
      notifications_inapp: {
        Row: {
          body: string
          cooperative_id: string
          created_at: string | null
          icon: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body: string
          cooperative_id: string
          created_at?: string | null
          icon?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
        }
        Update: {
          body?: string
          cooperative_id?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_inapp_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelles: {
        Row: {
          campaign_year: string | null
          cooperative_id: string
          created_at: string
          culture_name: string | null
          culture_principale: string | null
          gps_coordinates: string | null
          id: string
          member_id: string
          name: string | null
          source: string | null
          superficie_ha: number | null
          surface_ha: number | null
        }
        Insert: {
          campaign_year?: string | null
          cooperative_id: string
          created_at?: string
          culture_name?: string | null
          culture_principale?: string | null
          gps_coordinates?: string | null
          id?: string
          member_id: string
          name?: string | null
          source?: string | null
          superficie_ha?: number | null
          surface_ha?: number | null
        }
        Update: {
          campaign_year?: string | null
          cooperative_id?: string
          created_at?: string
          culture_name?: string | null
          culture_principale?: string | null
          gps_coordinates?: string | null
          id?: string
          member_id?: string
          name?: string | null
          source?: string | null
          superficie_ha?: number | null
          surface_ha?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelles_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_fcfa: number
          cooperative_id: string
          cotisation_id: string | null
          created_at: string | null
          currency: string
          failure_reason: string | null
          id: string
          member_id: string | null
          metadata: Json | null
          paid_at: string | null
          phone: string | null
          provider: string
          provider_tx_id: string | null
          reference: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount_fcfa: number
          cooperative_id: string
          cotisation_id?: string | null
          created_at?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          member_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          phone?: string | null
          provider?: string
          provider_tx_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount_fcfa?: number
          cooperative_id?: string
          cotisation_id?: string | null
          created_at?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          member_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          phone?: string | null
          provider?: string
          provider_tx_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_cotisation_id_fkey"
            columns: ["cotisation_id"]
            isOneToOne: false
            referencedRelation: "cotisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      prefectures: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          region_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          region_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prefectures_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          campaign: string | null
          campaign_year: string | null
          cooperative_id: string | null
          created_at: string
          culture_name: string | null
          id: string
          member_id: string | null
          parcelle_id: string
          quantity_kg: number | null
          source: string | null
        }
        Insert: {
          campaign?: string | null
          campaign_year?: string | null
          cooperative_id?: string | null
          created_at?: string
          culture_name?: string | null
          id?: string
          member_id?: string | null
          parcelle_id: string
          quantity_kg?: number | null
          source?: string | null
        }
        Update: {
          campaign?: string | null
          campaign_year?: string | null
          cooperative_id?: string | null
          created_at?: string
          culture_name?: string | null
          id?: string
          member_id?: string | null
          parcelle_id?: string
          quantity_kg?: number | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productions_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cooperative_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          cooperative_id?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          cooperative_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cooperative_id_fkey"
            columns: ["cooperative_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          access_granted: boolean
          amount: number
          buyer_email: string | null
          buyer_phone: string | null
          created_at: string
          currency: string
          fiche_id: string
          id: string
          payment_status: string
        }
        Insert: {
          access_granted?: boolean
          amount: number
          buyer_email?: string | null
          buyer_phone?: string | null
          created_at?: string
          currency?: string
          fiche_id: string
          id?: string
          payment_status?: string
        }
        Update: {
          access_granted?: boolean
          amount?: number
          buyer_email?: string | null
          buyer_phone?: string | null
          created_at?: string
          currency?: string
          fiche_id?: string
          id?: string
          payment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_fiche_id_fkey"
            columns: ["fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches_techniques"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      techniciens: {
        Row: {
          canton_id: string
          created_at: string
          faitiere_id: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          canton_id: string
          created_at?: string
          faitiere_id: string
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          canton_id?: string
          created_at?: string
          faitiere_id?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "techniciens_canton_id_fkey"
            columns: ["canton_id"]
            isOneToOne: false
            referencedRelation: "cantons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "techniciens_faitiere_id_fkey"
            columns: ["faitiere_id"]
            isOneToOne: false
            referencedRelation: "cooperatives"
            referencedColumns: ["id"]
          },
        ]
      }
      villages: {
        Row: {
          canton_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          canton_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          canton_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "villages_canton_id_fkey"
            columns: ["canton_id"]
            isOneToOne: false
            referencedRelation: "cantons"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_data: {
        Row: {
          created_at: string | null
          date: string
          et0_mm: number | null
          humidity_pct: number | null
          id: string
          latitude: number
          longitude: number
          precipitation_mm: number | null
          region: string | null
          solar_radiation_mj: number | null
          source: string
          temperature_max: number | null
          temperature_mean: number | null
          temperature_min: number | null
          wind_speed_ms: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          et0_mm?: number | null
          humidity_pct?: number | null
          id?: string
          latitude: number
          longitude: number
          precipitation_mm?: number | null
          region?: string | null
          solar_radiation_mj?: number | null
          source: string
          temperature_max?: number | null
          temperature_mean?: number | null
          temperature_min?: number | null
          wind_speed_ms?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          et0_mm?: number | null
          humidity_pct?: number | null
          id?: string
          latitude?: number
          longitude?: number
          precipitation_mm?: number | null
          region?: string | null
          solar_radiation_mj?: number | null
          source?: string
          temperature_max?: number | null
          temperature_mean?: number | null
          temperature_min?: number | null
          wind_speed_ms?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_cooperative_admin: {
        Args: { target_cooperative_id: string; target_user_id: string }
        Returns: undefined
      }
      calculate_member_ats: { Args: { p_member_id: string }; Returns: Json }
      get_accessible_cooperative_ids: { Args: never; Returns: string[] }
      get_cooperative_descendants: {
        Args: { p_root_id: string }
        Returns: {
          id: string
        }[]
      }
      get_kobo_stats: { Args: { p_cooperative_id: string }; Returns: Json }
      get_platform_totals: {
        Args: never
        Returns: {
          total_active_cards: number
          total_cooperatives: number
          total_exploitations: number
          total_members: number
        }[]
      }
      match_kobo_submission_to_member: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      process_kobo_submission: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      upsert_member_ats: { Args: { p_member_id: string }; Returns: undefined }
      verify_card: {
        Args: { p_card_numbers: string[] }
        Returns: {
          canton: string
          card_created_at: string
          card_number: string
          card_status: string
          cooperative_name: string
          expiry_date: string
          faitiere_name: string
          first_name: string
          last_name: string
          member_since: string
          member_status: string
          photo_url: string
          prefecture: string
          region: string
          village: string
        }[]
      }
    }
    Enums: {
      user_role: "super_admin" | "cooperative_admin" | "member" | "guest"
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
      user_role: ["super_admin", "cooperative_admin", "member", "guest"],
    },
  },
} as const

