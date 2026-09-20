export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      academy_assignment_submissions: {
        Row: {
          assignment_id: string
          attachment_url: string | null
          content_text: string | null
          created_at: string
          feedback: string | null
          id: string
          profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          attachment_url?: string | null
          content_text?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          attachment_url?: string | null
          content_text?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_assignment_submissions_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'academy_assignments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_assignment_submissions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_assignment_submissions_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      academy_assignments: {
        Row: {
          created_at: string
          id: string
          instructions: string
          is_required: boolean
          lesson_id: string
          max_score: number
          rubric: Json
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions: string
          is_required?: boolean
          lesson_id: string
          max_score?: number
          rubric?: Json
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          is_required?: boolean
          lesson_id?: string
          max_score?: number
          rubric?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_assignments_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: true
            referencedRelation: 'academy_lessons'
            referencedColumns: ['id']
          },
        ]
      }
      academy_lesson_slides: {
        Row: {
          body: string
          created_at: string
          id: string
          lesson_id: string
          media_asset_id: string | null
          order_index: number
          slide_type: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lesson_id: string
          media_asset_id?: string | null
          order_index: number
          slide_type: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lesson_id?: string
          media_asset_id?: string | null
          order_index?: number
          slide_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_lesson_slides_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'academy_lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_lesson_slides_media_asset_id_fkey'
            columns: ['media_asset_id']
            isOneToOne: false
            referencedRelation: 'academy_media_assets'
            referencedColumns: ['id']
          },
        ]
      }
      academy_lessons: {
        Row: {
          content_body: string | null
          content_type: string
          created_at: string | null
          duration_min: number | null
          id: string
          module_id: string
          order_index: number | null
          title: string
        }
        Insert: {
          content_body?: string | null
          content_type: string
          created_at?: string | null
          duration_min?: number | null
          id?: string
          module_id: string
          order_index?: number | null
          title: string
        }
        Update: {
          content_body?: string | null
          content_type?: string
          created_at?: string | null
          duration_min?: number | null
          id?: string
          module_id?: string
          order_index?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_lessons_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'academy_modules'
            referencedColumns: ['id']
          },
        ]
      }
      academy_media_assets: {
        Row: {
          alt_text: string | null
          annotations: Json
          asset_key: string
          asset_type: string
          created_at: string
          id: string
          lesson_id: string | null
          module_id: string | null
          source_route: string | null
          status: string
          storage_path: string | null
        }
        Insert: {
          alt_text?: string | null
          annotations?: Json
          asset_key: string
          asset_type: string
          created_at?: string
          id?: string
          lesson_id?: string | null
          module_id?: string | null
          source_route?: string | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          alt_text?: string | null
          annotations?: Json
          asset_key?: string
          asset_type?: string
          created_at?: string
          id?: string
          lesson_id?: string | null
          module_id?: string | null
          source_route?: string | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'academy_media_assets_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'academy_lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_media_assets_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'academy_modules'
            referencedColumns: ['id']
          },
        ]
      }
      academy_modules: {
        Row: {
          category: string
          cooperative_id: string | null
          created_at: string | null
          created_by: string | null
          culture: string | null
          description: string | null
          duration_min: number | null
          id: string
          is_published: boolean | null
          level: string
          order_index: number | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          category: string
          cooperative_id?: string | null
          created_at?: string | null
          created_by?: string | null
          culture?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          is_published?: boolean | null
          level?: string
          order_index?: number | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          category?: string
          cooperative_id?: string | null
          created_at?: string | null
          created_by?: string | null
          culture?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          is_published?: boolean | null
          level?: string
          order_index?: number | null
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_modules_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_modules_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_modules_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      academy_profile_progress: {
        Row: {
          completed_at: string | null
          id: string
          last_viewed_at: string | null
          lesson_id: string | null
          module_id: string
          profile_id: string
          progress_percent: number
          score: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          lesson_id?: string | null
          module_id: string
          profile_id: string
          progress_percent?: number
          score?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          lesson_id?: string | null
          module_id?: string
          profile_id?: string
          progress_percent?: number
          score?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_profile_progress_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'academy_lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_profile_progress_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'academy_modules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_profile_progress_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      academy_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          lesson_id: string | null
          member_id: string
          module_id: string
          score: number | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          member_id: string
          module_id: string
          score?: number | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          member_id?: string
          module_id?: string
          score?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_progress_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'academy_lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_progress_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_progress_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'academy_modules'
            referencedColumns: ['id']
          },
        ]
      }
      academy_quiz_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          passed: boolean | null
          profile_id: string
          quiz_id: string
          score: number | null
          started_at: string
          submitted_at: string | null
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          passed?: boolean | null
          profile_id: string
          quiz_id: string
          score?: number | null
          started_at?: string
          submitted_at?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          passed?: boolean | null
          profile_id?: string
          quiz_id?: string
          score?: number | null
          started_at?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'academy_quiz_attempts_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_quiz_attempts_quiz_id_fkey'
            columns: ['quiz_id']
            isOneToOne: false
            referencedRelation: 'academy_quizzes'
            referencedColumns: ['id']
          },
        ]
      }
      academy_quiz_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          label: string
          order_index: number
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label: string
          order_index: number
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label?: string
          order_index?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_quiz_options_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'academy_quiz_questions'
            referencedColumns: ['id']
          },
        ]
      }
      academy_quiz_questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          metadata: Json
          order_index: number
          points: number
          prompt: string
          question_type: string
          quiz_id: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          metadata?: Json
          order_index: number
          points?: number
          prompt: string
          question_type: string
          quiz_id: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          metadata?: Json
          order_index?: number
          points?: number
          prompt?: string
          question_type?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_quiz_questions_quiz_id_fkey'
            columns: ['quiz_id']
            isOneToOne: false
            referencedRelation: 'academy_quizzes'
            referencedColumns: ['id']
          },
        ]
      }
      academy_quizzes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          lesson_id: string | null
          max_attempts: number | null
          module_id: string
          passing_score: number
          randomize_questions: boolean
          show_feedback: boolean
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          lesson_id?: string | null
          max_attempts?: number | null
          module_id: string
          passing_score?: number
          randomize_questions?: boolean
          show_feedback?: boolean
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          lesson_id?: string | null
          max_attempts?: number | null
          module_id?: string
          passing_score?: number
          randomize_questions?: boolean
          show_feedback?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'academy_quizzes_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: true
            referencedRelation: 'academy_lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'academy_quizzes_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'academy_modules'
            referencedColumns: ['id']
          },
        ]
      }
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
      audit_logs: {
        Row: {
          action: string
          cooperative_id: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource: string | null
          resource_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          cooperative_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource?: string | null
          resource_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          cooperative_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource?: string | null
          resource_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'audit_logs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_logs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
      }
      billing_rules: {
        Row: {
          active: boolean
          code: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          label: string
          metadata: Json
          price_xof: number
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          label: string
          metadata?: Json
          price_xof: number
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          label?: string
          metadata?: Json
          price_xof?: number
          unit?: string
          updated_at?: string
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
            foreignKeyName: 'buyer_matches_listing_id_fkey'
            columns: ['listing_id']
            isOneToOne: false
            referencedRelation: 'market_listings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'buyer_matches_request_id_fkey'
            columns: ['request_id']
            isOneToOne: false
            referencedRelation: 'buyer_requests'
            referencedColumns: ['id']
          },
        ]
      }
      buyer_requests: {
        Row: {
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
            foreignKeyName: 'buyer_requests_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'buyer_requests_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
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
            foreignKeyName: 'campagnes_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campagnes_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
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
            foreignKeyName: 'cantons_commune_id_fkey'
            columns: ['commune_id']
            isOneToOne: false
            referencedRelation: 'communes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cantons_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
        ]
      }
      card_print_order_items: {
        Row: {
          created_at: string
          id: string
          member_card_id: string
          member_id: string
          order_id: string
          printed_at: string | null
          reprint_count: number
          unit_price_fcfa: number
        }
        Insert: {
          created_at?: string
          id?: string
          member_card_id: string
          member_id: string
          order_id: string
          printed_at?: string | null
          reprint_count?: number
          unit_price_fcfa: number
        }
        Update: {
          created_at?: string
          id?: string
          member_card_id?: string
          member_id?: string
          order_id?: string
          printed_at?: string | null
          reprint_count?: number
          unit_price_fcfa?: number
        }
        Relationships: [
          {
            foreignKeyName: 'card_print_order_items_member_card_id_fkey'
            columns: ['member_card_id']
            isOneToOne: false
            referencedRelation: 'member_cards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'card_print_order_items_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'card_print_order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'card_print_orders'
            referencedColumns: ['id']
          },
        ]
      }
      card_print_orders: {
        Row: {
          amount_fcfa: number
          cancelled_at: string | null
          cooperative_id: string
          created_at: string
          delivered_at: string | null
          id: string
          paid_at: string | null
          partner_id: string
          printed_at: string | null
          provider: string
          provider_reference: string | null
          requested_by: string | null
          status: Database['public']['Enums']['card_print_order_status']
          updated_at: string
        }
        Insert: {
          amount_fcfa: number
          cancelled_at?: string | null
          cooperative_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          paid_at?: string | null
          partner_id: string
          printed_at?: string | null
          provider?: string
          provider_reference?: string | null
          requested_by?: string | null
          status?: Database['public']['Enums']['card_print_order_status']
          updated_at?: string
        }
        Update: {
          amount_fcfa?: number
          cancelled_at?: string | null
          cooperative_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          paid_at?: string | null
          partner_id?: string
          printed_at?: string | null
          provider?: string
          provider_reference?: string | null
          requested_by?: string | null
          status?: Database['public']['Enums']['card_print_order_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'card_print_orders_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'card_print_orders_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'card_print_orders_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'card_print_orders_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
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
            foreignKeyName: 'communes_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
        ]
      }
      contact_messages: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
        }
        Insert: {
          category?: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          buyer_name: string | null
          buyer_phone: string | null
          created_at: string
          email: string | null
          id: string
          member_id: string | null
          message: string
          name: string | null
          status: string
        }
        Insert: {
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          member_id?: string | null
          message: string
          name?: string | null
          status?: string
        }
        Update: {
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          member_id?: string | null
          message?: string
          name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contact_requests_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
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
            foreignKeyName: 'cooperative_settings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: true
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cooperative_settings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: true
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
      }
      cooperatives: {
        Row: {
          coordo_name: string | null
          coordo_phone: string | null
          created_at: string | null
          culture_categories: Json | null
          deleted_at: string | null
          description: string | null
          faitiere_name: string | null
          id: string
          is_demo: boolean
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
          deleted_at?: string | null
          description?: string | null
          faitiere_name?: string | null
          id?: string
          is_demo?: boolean
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
          deleted_at?: string | null
          description?: string | null
          faitiere_name?: string | null
          id?: string
          is_demo?: boolean
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
            foreignKeyName: 'cooperatives_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cooperatives_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
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
          reference_number: string | null
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
          reference_number?: string | null
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
          reference_number?: string | null
          status?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cotisations_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cotisations_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cotisations_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
      }
      credit_applications: {
        Row: {
          amount_approved_fcfa: number | null
          amount_requested_fcfa: number
          ats_score_at_application: number | null
          cooperative_id: string
          created_at: string | null
          credit_grade: string | null
          credit_score: number | null
          disbursed_at: string | null
          duration_months: number
          id: string
          interest_rate_pct: number | null
          member_id: string
          notes: string | null
          purpose: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount_approved_fcfa?: number | null
          amount_requested_fcfa: number
          ats_score_at_application?: number | null
          cooperative_id: string
          created_at?: string | null
          credit_grade?: string | null
          credit_score?: number | null
          disbursed_at?: string | null
          duration_months: number
          id?: string
          interest_rate_pct?: number | null
          member_id: string
          notes?: string | null
          purpose: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount_approved_fcfa?: number | null
          amount_requested_fcfa?: number
          ats_score_at_application?: number | null
          cooperative_id?: string
          created_at?: string | null
          credit_grade?: string | null
          credit_score?: number | null
          disbursed_at?: string | null
          duration_months?: number
          id?: string
          interest_rate_pct?: number | null
          member_id?: string
          notes?: string | null
          purpose?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'credit_applications_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'credit_applications_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'credit_applications_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'credit_applications_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      credit_repayments: {
        Row: {
          amount_due_fcfa: number
          amount_paid_fcfa: number | null
          application_id: string
          created_at: string | null
          due_date: string
          id: string
          paid_at: string | null
          status: string
        }
        Insert: {
          amount_due_fcfa: number
          amount_paid_fcfa?: number | null
          application_id: string
          created_at?: string | null
          due_date: string
          id?: string
          paid_at?: string | null
          status?: string
        }
        Update: {
          amount_due_fcfa?: number
          amount_paid_fcfa?: number | null
          application_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          paid_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'credit_repayments_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'credit_applications'
            referencedColumns: ['id']
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
      embed_configs: {
        Row: {
          allowed_origins: string[]
          cooperative_id: string
          created_at: string
          custom_domain: string | null
          enabled: boolean
          id: string
          logo_url: string | null
          theme: Json
          updated_at: string
          widgets: string[]
        }
        Insert: {
          allowed_origins?: string[]
          cooperative_id: string
          created_at?: string
          custom_domain?: string | null
          enabled?: boolean
          id?: string
          logo_url?: string | null
          theme?: Json
          updated_at?: string
          widgets?: string[]
        }
        Update: {
          allowed_origins?: string[]
          cooperative_id?: string
          created_at?: string
          custom_domain?: string | null
          enabled?: boolean
          id?: string
          logo_url?: string | null
          theme?: Json
          updated_at?: string
          widgets?: string[]
        }
        Relationships: [
          {
            foreignKeyName: 'embed_configs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: true
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'embed_configs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: true
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
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
            foreignKeyName: 'fiches_techniques_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fiches_techniques_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fiches_techniques_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fiches_techniques_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fiches_techniques_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_acheteur_cantons: {
        Row: {
          acheteur_id: string
          canton_id: string
        }
        Insert: {
          acheteur_id: string
          canton_id: string
        }
        Update: {
          acheteur_id?: string
          canton_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_acheteur_cantons_acheteur_id_fkey'
            columns: ['acheteur_id']
            isOneToOne: false
            referencedRelation: 'haroo_acheteur_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'haroo_acheteur_cantons_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_acheteur_profiles: {
        Row: {
          card_number: string | null
          created_at: string | null
          first_name: string
          id: string
          last_name: string
          member_card_id: string | null
          phone: string | null
          photo_url: string | null
          prefecture_id: string | null
          produits_interesses: string[]
          type_acheteur: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          card_number?: string | null
          created_at?: string | null
          first_name: string
          id?: string
          last_name: string
          member_card_id?: string | null
          phone?: string | null
          photo_url?: string | null
          prefecture_id?: string | null
          produits_interesses?: string[]
          type_acheteur?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          card_number?: string | null
          created_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
          member_card_id?: string | null
          phone?: string | null
          photo_url?: string | null
          prefecture_id?: string | null
          produits_interesses?: string[]
          type_acheteur?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_acheteur_profiles_member_card_id_fkey'
            columns: ['member_card_id']
            isOneToOne: false
            referencedRelation: 'member_cards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'haroo_acheteur_profiles_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_agronome_profiles: {
        Row: {
          badge_valide: boolean
          canton_id: string | null
          card_number: string | null
          created_at: string | null
          first_name: string
          id: string
          last_name: string
          member_card_id: string | null
          nombre_missions: number
          note_moyenne: number
          phone: string | null
          photo_url: string | null
          specialisations: string[]
          statut_validation: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          badge_valide?: boolean
          canton_id?: string | null
          card_number?: string | null
          created_at?: string | null
          first_name: string
          id?: string
          last_name: string
          member_card_id?: string | null
          nombre_missions?: number
          note_moyenne?: number
          phone?: string | null
          photo_url?: string | null
          specialisations?: string[]
          statut_validation?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          badge_valide?: boolean
          canton_id?: string | null
          card_number?: string | null
          created_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
          member_card_id?: string | null
          nombre_missions?: number
          note_moyenne?: number
          phone?: string | null
          photo_url?: string | null
          specialisations?: string[]
          statut_validation?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_agronome_profiles_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'haroo_agronome_profiles_member_card_id_fkey'
            columns: ['member_card_id']
            isOneToOne: false
            referencedRelation: 'member_cards'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_jobs: {
        Row: {
          canton_id: string | null
          created_at: string | null
          created_by: string | null
          date_debut: string | null
          date_fin: string | null
          description: string | null
          id: string
          nombre_postes: number | null
          salaire_horaire: number | null
          statut: string
          type_travail: string
        }
        Insert: {
          canton_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_debut?: string | null
          date_fin?: string | null
          description?: string | null
          id?: string
          nombre_postes?: number | null
          salaire_horaire?: number | null
          statut?: string
          type_travail: string
        }
        Update: {
          canton_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_debut?: string | null
          date_fin?: string | null
          description?: string | null
          id?: string
          nombre_postes?: number | null
          salaire_horaire?: number | null
          statut?: string
          type_travail?: string
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_jobs_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_missions: {
        Row: {
          agronome_id: string
          budget_propose: number | null
          created_at: string | null
          date_debut: string | null
          date_fin: string | null
          description: string | null
          exploitant_name: string | null
          id: string
          statut: string
        }
        Insert: {
          agronome_id: string
          budget_propose?: number | null
          created_at?: string | null
          date_debut?: string | null
          date_fin?: string | null
          description?: string | null
          exploitant_name?: string | null
          id?: string
          statut?: string
        }
        Update: {
          agronome_id?: string
          budget_propose?: number | null
          created_at?: string | null
          date_debut?: string | null
          date_fin?: string | null
          description?: string | null
          exploitant_name?: string | null
          id?: string
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_missions_agronome_id_fkey'
            columns: ['agronome_id']
            isOneToOne: false
            referencedRelation: 'haroo_agronome_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_ouvrier_cantons: {
        Row: {
          canton_id: string
          ouvrier_id: string
        }
        Insert: {
          canton_id: string
          ouvrier_id: string
        }
        Update: {
          canton_id?: string
          ouvrier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_ouvrier_cantons_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'haroo_ouvrier_cantons_ouvrier_id_fkey'
            columns: ['ouvrier_id']
            isOneToOne: false
            referencedRelation: 'haroo_ouvrier_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_ouvrier_profiles: {
        Row: {
          card_number: string | null
          competences: string[]
          created_at: string | null
          disponible: boolean
          first_name: string
          id: string
          last_name: string
          member_card_id: string | null
          nombre_avis: number
          note_moyenne: number
          phone: string | null
          photo_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          card_number?: string | null
          competences?: string[]
          created_at?: string | null
          disponible?: boolean
          first_name: string
          id?: string
          last_name: string
          member_card_id?: string | null
          nombre_avis?: number
          note_moyenne?: number
          phone?: string | null
          photo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          card_number?: string | null
          competences?: string[]
          created_at?: string | null
          disponible?: boolean
          first_name?: string
          id?: string
          last_name?: string
          member_card_id?: string | null
          nombre_avis?: number
          note_moyenne?: number
          phone?: string | null
          photo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_ouvrier_profiles_member_card_id_fkey'
            columns: ['member_card_id']
            isOneToOne: false
            referencedRelation: 'member_cards'
            referencedColumns: ['id']
          },
        ]
      }
      haroo_presales: {
        Row: {
          canton_id: string | null
          created_at: string | null
          created_by: string | null
          culture: string
          date_recolte_prevue: string | null
          description: string | null
          id: string
          prix_par_tonne: number | null
          quantite_estimee: number | null
          statut: string
        }
        Insert: {
          canton_id?: string | null
          created_at?: string | null
          created_by?: string | null
          culture: string
          date_recolte_prevue?: string | null
          description?: string | null
          id?: string
          prix_par_tonne?: number | null
          quantite_estimee?: number | null
          statut?: string
        }
        Update: {
          canton_id?: string | null
          created_at?: string | null
          created_by?: string | null
          culture?: string
          date_recolte_prevue?: string | null
          description?: string | null
          id?: string
          prix_par_tonne?: number | null
          quantite_estimee?: number | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: 'haroo_presales_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
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
            foreignKeyName: 'integrations_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'integrations_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
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
            foreignKeyName: 'intrants_campagne_id_fkey'
            columns: ['campagne_id']
            isOneToOne: false
            referencedRelation: 'campagnes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'intrants_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'intrants_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'intrants_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
            foreignKeyName: 'journal_entries_campagne_id_fkey'
            columns: ['campagne_id']
            isOneToOne: false
            referencedRelation: 'campagnes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journal_entries_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journal_entries_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journal_entries_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journal_entries_parcelle_id_fkey'
            columns: ['parcelle_id']
            isOneToOne: false
            referencedRelation: 'parcelles'
            referencedColumns: ['id']
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
            foreignKeyName: 'kobo_field_mappings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'kobo_field_mappings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
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
            foreignKeyName: 'kobo_submissions_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'kobo_submissions_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'kobo_submissions_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
            foreignKeyName: 'kobo_sync_logs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'kobo_sync_logs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'kobo_sync_logs_integration_id_fkey'
            columns: ['integration_id']
            isOneToOne: false
            referencedRelation: 'integrations'
            referencedColumns: ['id']
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
            foreignKeyName: 'market_listings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_listings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_listings_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
            foreignKeyName: 'market_prices_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_prices_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_prices_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_prices_culture_id_fkey'
            columns: ['culture_id']
            isOneToOne: false
            referencedRelation: 'cultures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'market_prices_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
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
            foreignKeyName: 'marketplace_products_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'marketplace_products_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'marketplace_products_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'marketplace_products_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
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
            foreignKeyName: 'member_access_logs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_access_logs_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_access_logs_fiche_id_fkey'
            columns: ['fiche_id']
            isOneToOne: false
            referencedRelation: 'fiches_techniques'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_access_logs_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
            foreignKeyName: 'member_ats_scores_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_ats_scores_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_ats_scores_member_id_fkey'
            columns: ['member_id']
            isOneToOne: true
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
      }
      member_cards: {
        Row: {
          card_number: string
          card_type: string
          cooperative_id: string | null
          created_at: string | null
          deleted_at: string | null
          expiry_date: string | null
          id: string
          member_id: string | null
          qr_data: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          card_number: string
          card_type?: string
          cooperative_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          member_id?: string | null
          qr_data?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          card_number?: string
          card_type?: string
          cooperative_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          member_id?: string | null
          qr_data?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'member_cards_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_cards_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_cards_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
            foreignKeyName: 'members_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'members_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'members_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'members_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'members_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
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
            foreignKeyName: 'notification_queue_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_queue_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_queue_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_queue_template_key_fkey'
            columns: ['template_key']
            isOneToOne: false
            referencedRelation: 'notification_templates'
            referencedColumns: ['key']
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
            foreignKeyName: 'notifications_inapp_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_inapp_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
      }
      organization_earnings: {
        Row: {
          amount_fcfa: number
          cooperative_id: string
          created_at: string
          currency: string
          id: string
          order_id: string
          order_item_id: string
          partner_id: string
          settled_at: string | null
          settlement_method: string | null
          settlement_reference: string | null
          status: Database['public']['Enums']['organization_earning_status']
          updated_at: string
        }
        Insert: {
          amount_fcfa: number
          cooperative_id: string
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          order_item_id: string
          partner_id: string
          settled_at?: string | null
          settlement_method?: string | null
          settlement_reference?: string | null
          status?: Database['public']['Enums']['organization_earning_status']
          updated_at?: string
        }
        Update: {
          amount_fcfa?: number
          cooperative_id?: string
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          order_item_id?: string
          partner_id?: string
          settled_at?: string | null
          settlement_method?: string | null
          settlement_reference?: string | null
          status?: Database['public']['Enums']['organization_earning_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'organization_earnings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'organization_earnings_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'organization_earnings_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'card_print_orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'organization_earnings_order_item_id_fkey'
            columns: ['order_item_id']
            isOneToOne: true
            referencedRelation: 'card_print_order_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'organization_earnings_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
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
          irrigation_type: string | null
          member_id: string
          name: string | null
          soil_type: string | null
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
          irrigation_type?: string | null
          member_id: string
          name?: string | null
          soil_type?: string | null
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
          irrigation_type?: string | null
          member_id?: string
          name?: string | null
          soil_type?: string | null
          source?: string | null
          superficie_ha?: number | null
          surface_ha?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'parcelles_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parcelles_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parcelles_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
        ]
      }
      partner_assignment_scopes: {
        Row: {
          assignment_id: string
          scope: Database['public']['Enums']['partner_access_scope']
        }
        Insert: {
          assignment_id: string
          scope: Database['public']['Enums']['partner_access_scope']
        }
        Update: {
          assignment_id?: string
          scope?: Database['public']['Enums']['partner_access_scope']
        }
        Relationships: [
          {
            foreignKeyName: 'partner_assignment_scopes_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'partner_organization_assignments'
            referencedColumns: ['id']
          },
        ]
      }
      partner_certifications: {
        Row: {
          academy_module_id: string | null
          certified_at: string | null
          created_at: string
          exam_passed_at: string | null
          exam_score: number | null
          id: string
          partner_id: string | null
          training_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          academy_module_id?: string | null
          certified_at?: string | null
          created_at?: string
          exam_passed_at?: string | null
          exam_score?: number | null
          id?: string
          partner_id?: string | null
          training_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          academy_module_id?: string | null
          certified_at?: string | null
          created_at?: string
          exam_passed_at?: string | null
          exam_score?: number | null
          id?: string
          partner_id?: string | null
          training_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'partner_certifications_academy_module_id_fkey'
            columns: ['academy_module_id']
            isOneToOne: false
            referencedRelation: 'academy_modules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_certifications_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_certifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      partner_memberships: {
        Row: {
          created_at: string
          id: string
          membership_role: Database['public']['Enums']['partner_membership_role']
          partner_id: string
          status: Database['public']['Enums']['partner_membership_status']
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_role?: Database['public']['Enums']['partner_membership_role']
          partner_id: string
          status?: Database['public']['Enums']['partner_membership_status']
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_role?: Database['public']['Enums']['partner_membership_role']
          partner_id?: string
          status?: Database['public']['Enums']['partner_membership_status']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'partner_memberships_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      partner_organization_assignments: {
        Row: {
          approved_by: string | null
          cooperative_id: string
          created_at: string
          ended_at: string | null
          id: string
          is_primary_operator: boolean
          partner_id: string
          revoked_by: string | null
          started_at: string
          status: Database['public']['Enums']['partner_assignment_status']
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          cooperative_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_primary_operator?: boolean
          partner_id: string
          revoked_by?: string | null
          started_at?: string
          status?: Database['public']['Enums']['partner_assignment_status']
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          cooperative_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_primary_operator?: boolean
          partner_id?: string
          revoked_by?: string | null
          started_at?: string
          status?: Database['public']['Enums']['partner_assignment_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'partner_organization_assignments_approved_by_fkey'
            columns: ['approved_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_organization_assignments_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_organization_assignments_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_organization_assignments_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_organization_assignments_revoked_by_fkey'
            columns: ['revoked_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      partner_payment_intents: {
        Row: {
          amount_fcfa: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          paid_at: string | null
          partner_id: string
          phone: string | null
          provider: string
          provider_reference: string
          purpose: Database['public']['Enums']['partner_payment_purpose']
          status: Database['public']['Enums']['partner_payment_intent_status']
          updated_at: string
        }
        Insert: {
          amount_fcfa: number
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          partner_id: string
          phone?: string | null
          provider?: string
          provider_reference: string
          purpose: Database['public']['Enums']['partner_payment_purpose']
          status?: Database['public']['Enums']['partner_payment_intent_status']
          updated_at?: string
        }
        Update: {
          amount_fcfa?: number
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          partner_id?: string
          phone?: string | null
          provider?: string
          provider_reference?: string
          purpose?: Database['public']['Enums']['partner_payment_purpose']
          status?: Database['public']['Enums']['partner_payment_intent_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'partner_payment_intents_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_payment_intents_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
        ]
      }
      partner_wallet_ledger: {
        Row: {
          amount_fcfa: number
          balance_after: number
          created_at: string
          created_by: string | null
          entry_type: Database['public']['Enums']['partner_ledger_entry_type']
          id: string
          idempotency_key: string
          note: string | null
          partner_id: string
          payment_intent_id: string | null
          reversed_ledger_id: string | null
          usage_event_id: string | null
          wallet_id: string
        }
        Insert: {
          amount_fcfa: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          entry_type: Database['public']['Enums']['partner_ledger_entry_type']
          id?: string
          idempotency_key: string
          note?: string | null
          partner_id: string
          payment_intent_id?: string | null
          reversed_ledger_id?: string | null
          usage_event_id?: string | null
          wallet_id: string
        }
        Update: {
          amount_fcfa?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          entry_type?: Database['public']['Enums']['partner_ledger_entry_type']
          id?: string
          idempotency_key?: string
          note?: string | null
          partner_id?: string
          payment_intent_id?: string | null
          reversed_ledger_id?: string | null
          usage_event_id?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_wallet_ledger_payment_intent'
            columns: ['payment_intent_id']
            isOneToOne: false
            referencedRelation: 'partner_payment_intents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fk_wallet_ledger_usage_event'
            columns: ['usage_event_id']
            isOneToOne: false
            referencedRelation: 'usage_events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_wallet_ledger_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_wallet_ledger_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_wallet_ledger_reversed_ledger_id_fkey'
            columns: ['reversed_ledger_id']
            isOneToOne: false
            referencedRelation: 'partner_wallet_ledger'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partner_wallet_ledger_wallet_id_fkey'
            columns: ['wallet_id']
            isOneToOne: false
            referencedRelation: 'partner_wallets'
            referencedColumns: ['id']
          },
        ]
      }
      partner_wallets: {
        Row: {
          balance_fcfa: number
          created_at: string
          id: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          balance_fcfa?: number
          created_at?: string
          id?: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          balance_fcfa?: number
          created_at?: string
          id?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'partner_wallets_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: true
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
        ]
      }
      partners: {
        Row: {
          business_name: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          partner_code: string
          phone: string | null
          prefecture_id: string | null
          region_id: string | null
          status: Database['public']['Enums']['partner_status']
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          partner_code: string
          phone?: string | null
          prefecture_id?: string | null
          region_id?: string | null
          status?: Database['public']['Enums']['partner_status']
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          partner_code?: string
          phone?: string | null
          prefecture_id?: string | null
          region_id?: string | null
          status?: Database['public']['Enums']['partner_status']
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'partners_prefecture_id_fkey'
            columns: ['prefecture_id']
            isOneToOne: false
            referencedRelation: 'prefectures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'partners_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
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
            foreignKeyName: 'payments_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_cotisation_id_fkey'
            columns: ['cotisation_id']
            isOneToOne: false
            referencedRelation: 'cotisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
            foreignKeyName: 'prefectures_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
          },
        ]
      }
      producer_announcements: {
        Row: {
          contact_phone: string | null
          cooperative_id: string | null
          created_at: string
          culture: string | null
          description: string | null
          id: string
          location_canton: string | null
          member_id: string
          price_per_kg_fcfa: number | null
          quantity_kg: number | null
          status: string
          title: string
          type: string
        }
        Insert: {
          contact_phone?: string | null
          cooperative_id?: string | null
          created_at?: string
          culture?: string | null
          description?: string | null
          id?: string
          location_canton?: string | null
          member_id: string
          price_per_kg_fcfa?: number | null
          quantity_kg?: number | null
          status?: string
          title: string
          type: string
        }
        Update: {
          contact_phone?: string | null
          cooperative_id?: string | null
          created_at?: string
          culture?: string | null
          description?: string | null
          id?: string
          location_canton?: string | null
          member_id?: string
          price_per_kg_fcfa?: number | null
          quantity_kg?: number | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'producer_announcements_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'producer_announcements_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'producer_announcements_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
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
            foreignKeyName: 'productions_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'productions_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'productions_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'productions_parcelle_id_fkey'
            columns: ['parcelle_id']
            isOneToOne: false
            referencedRelation: 'parcelles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          cooperative_id: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          first_name: string | null
          haroo_activated_at: string | null
          haroo_type: Database['public']['Enums']['haroo_profile_type'] | null
          id: string
          is_demo: boolean
          last_name: string | null
          org_activated_at: string | null
          role: Database['public']['Enums']['user_role']
          updated_at: string | null
        }
        Insert: {
          cooperative_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          first_name?: string | null
          haroo_activated_at?: string | null
          haroo_type?: Database['public']['Enums']['haroo_profile_type'] | null
          id: string
          is_demo?: boolean
          last_name?: string | null
          org_activated_at?: string | null
          role?: Database['public']['Enums']['user_role']
          updated_at?: string | null
        }
        Update: {
          cooperative_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          first_name?: string | null
          haroo_activated_at?: string | null
          haroo_type?: Database['public']['Enums']['haroo_profile_type'] | null
          id?: string
          is_demo?: boolean
          last_name?: string | null
          org_activated_at?: string | null
          role?: Database['public']['Enums']['user_role']
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'profiles_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
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
            foreignKeyName: 'purchases_fiche_id_fkey'
            columns: ['fiche_id']
            isOneToOne: false
            referencedRelation: 'fiches_techniques'
            referencedColumns: ['id']
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
      site_visits: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_new_visitor: boolean
          latitude: number | null
          longitude: number | null
          path: string
          referrer: string | null
          region: string | null
          visitor_hash: string
          visitor_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_new_visitor?: boolean
          latitude?: number | null
          longitude?: number | null
          path: string
          referrer?: string | null
          region?: string | null
          visitor_hash: string
          visitor_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_new_visitor?: boolean
          latitude?: number | null
          longitude?: number | null
          path?: string
          referrer?: string | null
          region?: string | null
          visitor_hash?: string
          visitor_id?: string | null
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
            foreignKeyName: 'techniciens_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'techniciens_faitiere_id_fkey'
            columns: ['faitiere_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'techniciens_faitiere_id_fkey'
            columns: ['faitiere_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
      }
      templates: {
        Row: {
          category: string
          cooperative_id: string
          created_at: string
          culture: string | null
          description: string | null
          download_count: number
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          title: string
        }
        Insert: {
          category?: string
          cooperative_id: string
          created_at?: string
          culture?: string | null
          description?: string | null
          download_count?: number
          file_name: string
          file_size?: number | null
          file_type?: string
          file_url: string
          id?: string
          title: string
        }
        Update: {
          category?: string
          cooperative_id?: string
          created_at?: string
          culture?: string | null
          description?: string | null
          download_count?: number
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'templates_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'templates_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
      }
      usage_events: {
        Row: {
          amount_fcfa: number
          billing_rule_id: string
          cooperative_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          partner_id: string
          quantity: number
          unit_price_fcfa: number
        }
        Insert: {
          amount_fcfa: number
          billing_rule_id: string
          cooperative_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          partner_id: string
          quantity?: number
          unit_price_fcfa: number
        }
        Update: {
          amount_fcfa?: number
          billing_rule_id?: string
          cooperative_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          partner_id?: string
          quantity?: number
          unit_price_fcfa?: number
        }
        Relationships: [
          {
            foreignKeyName: 'usage_events_billing_rule_id_fkey'
            columns: ['billing_rule_id']
            isOneToOne: false
            referencedRelation: 'billing_rules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'usage_events_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'usage_events_cooperative_id_fkey'
            columns: ['cooperative_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'usage_events_partner_id_fkey'
            columns: ['partner_id']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['id']
          },
        ]
      }
      user_login_events: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_login_events_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
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
            foreignKeyName: 'villages_canton_id_fkey'
            columns: ['canton_id']
            isOneToOne: false
            referencedRelation: 'cantons'
            referencedColumns: ['id']
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
      cooperative_stats: {
        Row: {
          active_card_count: number | null
          created_at: string | null
          description: string | null
          exploitation_count: number | null
          hierarchy_card_count: number | null
          hierarchy_member_count: number | null
          id: string | null
          level: string | null
          member_count: number | null
          name: string | null
          parent_id: string | null
          primary_color: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cooperatives_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'cooperative_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cooperatives_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'cooperatives'
            referencedColumns: ['id']
          },
        ]
      }
      market_prices_freshness: {
        Row: {
          is_stale: boolean | null
          last_updated_at: string | null
          total_prices: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      bootstrap_cooperative_admin: {
        Args: { target_cooperative_id: string; target_user_id: string }
        Returns: undefined
      }
      calculate_member_ats: { Args: { p_member_id: string }; Returns: Json }
      credit_partner_wallet: {
        Args: {
          p_amount_fcfa: number
          p_created_by?: string
          p_entry_type: Database['public']['Enums']['partner_ledger_entry_type']
          p_idempotency_key: string
          p_note?: string
          p_partner_id: string
          p_payment_intent_id?: string
        }
        Returns: Json
      }
      current_haroo_type: {
        Args: never
        Returns: Database['public']['Enums']['haroo_profile_type']
      }
      current_partner_ids: { Args: never; Returns: string[] }
      debit_partner_wallet: {
        Args: {
          p_billing_rule_code: string
          p_cooperative_id?: string
          p_idempotency_key: string
          p_partner_id: string
          p_quantity?: number
        }
        Returns: Json
      }
      get_accessible_cooperative_ids: { Args: never; Returns: string[] }
      get_cooperative_descendants: {
        Args: { p_root_id: string }
        Returns: {
          id: string
        }[]
      }
      get_dashboard_stats: {
        Args: { p_cooperative_id: string }
        Returns: {
          active_cards: number
          scans_today: number
          total_exploitations: number
          total_members: number
          total_parcelles: number
        }[]
      }
      get_kobo_stats: { Args: { p_cooperative_id: string }; Returns: Json }
      get_member_score: { Args: { target_member_id: string }; Returns: Json }
      get_platform_totals: {
        Args: never
        Returns: {
          total_active_cards: number
          total_cooperatives: number
          total_exploitations: number
          total_members: number
        }[]
      }
      has_org_access: {
        Args: {
          allowed: Database['public']['Enums']['user_role'][]
          target_coop: string
        }
        Returns: boolean
      }
      has_partner_org_access: {
        Args: {
          required_scope?: Database['public']['Enums']['partner_access_scope']
          target_coop: string
        }
        Returns: boolean
      }
      increment_download_count: {
        Args: { target_fiche_id: string }
        Returns: undefined
      }
      match_kobo_submission_to_member: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      process_kobo_submission: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      purge_old_ai_conversations: { Args: never; Returns: undefined }
      purge_old_weather_data: { Args: never; Returns: undefined }
      search_marketplace: {
        Args: {
          filter_available?: boolean
          filter_canton_id?: string
          filter_category?: string
          filter_certification?: string
          filter_cooperative_id?: string
          filter_culture?: string
          filter_max_price?: number
          filter_min_price?: number
          filter_prefecture_id?: string
          filter_producer_type?: string
          filter_region_id?: string
          filter_season?: string
          page_number?: number
          page_size?: number
          search_query?: string
          sort_by?: string
          sort_order?: string
        }
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
      card_print_order_status: 'requested' | 'paid' | 'printed' | 'delivered' | 'cancelled'
      haroo_profile_type: 'ouvrier' | 'acheteur' | 'agronome'
      organization_earning_status: 'pending' | 'available' | 'paid' | 'cancelled'
      partner_access_scope:
        | 'members.read'
        | 'members.manage'
        | 'cards.read'
        | 'cards.manage'
        | 'cards.print'
        | 'kobo.manage'
        | 'imports.manage'
        | 'analytics.read'
        | 'reports.generate'
        | 'projects.manage'
        | 'support.manage'
      partner_assignment_status: 'active' | 'revoked' | 'ended'
      partner_ledger_entry_type: 'CREDIT' | 'DEBIT' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT' | 'BONUS'
      partner_membership_role: 'owner' | 'manager' | 'agent'
      partner_membership_status: 'active' | 'revoked'
      partner_payment_intent_status:
        | 'pending'
        | 'processing'
        | 'success'
        | 'failed'
        | 'cancelled'
        | 'expired'
      partner_payment_purpose: 'wallet_topup' | 'certification' | 'operator_subscription'
      partner_status:
        | 'candidate'
        | 'training'
        | 'exam_pending'
        | 'certified'
        | 'active'
        | 'suspended'
        | 'expired'
        | 'revoked'
      user_role:
        | 'super_admin'
        | 'cooperative_admin'
        | 'member'
        | 'guest'
        | 'ouvrier'
        | 'acheteur'
        | 'agronome'
        | 'none'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      card_print_order_status: ['requested', 'paid', 'printed', 'delivered', 'cancelled'],
      haroo_profile_type: ['ouvrier', 'acheteur', 'agronome'],
      organization_earning_status: ['pending', 'available', 'paid', 'cancelled'],
      partner_access_scope: [
        'members.read',
        'members.manage',
        'cards.read',
        'cards.manage',
        'cards.print',
        'kobo.manage',
        'imports.manage',
        'analytics.read',
        'reports.generate',
        'projects.manage',
        'support.manage',
      ],
      partner_assignment_status: ['active', 'revoked', 'ended'],
      partner_ledger_entry_type: ['CREDIT', 'DEBIT', 'REFUND', 'REVERSAL', 'ADJUSTMENT', 'BONUS'],
      partner_membership_role: ['owner', 'manager', 'agent'],
      partner_membership_status: ['active', 'revoked'],
      partner_payment_intent_status: [
        'pending',
        'processing',
        'success',
        'failed',
        'cancelled',
        'expired',
      ],
      partner_payment_purpose: ['wallet_topup', 'certification', 'operator_subscription'],
      partner_status: [
        'candidate',
        'training',
        'exam_pending',
        'certified',
        'active',
        'suspended',
        'expired',
        'revoked',
      ],
      user_role: [
        'super_admin',
        'cooperative_admin',
        'member',
        'guest',
        'ouvrier',
        'acheteur',
        'agronome',
        'none',
      ],
    },
  },
} as const
