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
      ai_requests_log: {
        Row: {
          created_at: string | null
          credits_used: number
          id: string
          request_data: Json | null
          request_type: string
          response_data: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_used: number
          id?: string
          request_data?: Json | null
          request_type: string
          response_data?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_used?: number
          id?: string
          request_data?: Json | null
          request_type?: string
          response_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      backfill_jobs: {
        Row: {
          created_at: string
          done_bars: number
          error: string | null
          est_total_bars: number | null
          from_ts: string
          id: string
          last_ts: string | null
          status: string
          symbol: string
          timeframe: string
          to_ts: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done_bars?: number
          error?: string | null
          est_total_bars?: number | null
          from_ts: string
          id?: string
          last_ts?: string | null
          status?: string
          symbol: string
          timeframe: string
          to_ts: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done_bars?: number
          error?: string | null
          est_total_bars?: number | null
          from_ts?: string
          id?: string
          last_ts?: string | null
          status?: string
          symbol?: string
          timeframe?: string
          to_ts?: string
          updated_at?: string
        }
        Relationships: []
      }
      cot_positions: {
        Row: {
          change_wow: number | null
          created_at: string
          currency: string
          id: string
          net_position: number | null
          non_commercial_long: number | null
          non_commercial_short: number | null
          open_interest: number | null
          raw: Json | null
          report_date: string
        }
        Insert: {
          change_wow?: number | null
          created_at?: string
          currency: string
          id?: string
          net_position?: number | null
          non_commercial_long?: number | null
          non_commercial_short?: number | null
          open_interest?: number | null
          raw?: Json | null
          report_date: string
        }
        Update: {
          change_wow?: number | null
          created_at?: string
          currency?: string
          id?: string
          net_position?: number | null
          non_commercial_long?: number | null
          non_commercial_short?: number | null
          open_interest?: number | null
          raw?: Json | null
          report_date?: string
        }
        Relationships: []
      }
      credit_purchases: {
        Row: {
          amount_cents: number
          created_at: string
          credits_granted: number
          currency: string
          id: string
          package_key: string
          status: string
          stripe_payment_intent: string | null
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credits_granted: number
          currency?: string
          id?: string
          package_key: string
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits_granted?: number
          currency?: string
          id?: string
          package_key?: string
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_forecasts: {
        Row: {
          accuracy_score: number | null
          actual_direction: string | null
          actual_move_pips: number | null
          adjustments_count: number
          created_at: string
          current_entry: number | null
          current_stop: number | null
          current_target: number | null
          direction: string
          evaluated_at: string | null
          evaluation_notes: string | null
          expected_move_pips: number | null
          external_agreement: string | null
          external_confidence: number | null
          external_direction: string | null
          forecast_date: string
          forecast_horizon_hours: number
          hit_stop: boolean | null
          hit_target: boolean | null
          id: string
          invalidation_reason: string | null
          last_revalidated_at: string | null
          median_mae_pips: number | null
          median_move_pips: number | null
          model_version: string | null
          n_matches: number | null
          news_context: string | null
          p_down: number | null
          p_flat: number | null
          p_up: number | null
          pattern_key: string | null
          price_at_forecast: number
          probability: number
          reasoning: string | null
          stat_source: string | null
          status: string
          stop_price: number | null
          symbol: string
          target_price: number | null
          technical_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          accuracy_score?: number | null
          actual_direction?: string | null
          actual_move_pips?: number | null
          adjustments_count?: number
          created_at?: string
          current_entry?: number | null
          current_stop?: number | null
          current_target?: number | null
          direction: string
          evaluated_at?: string | null
          evaluation_notes?: string | null
          expected_move_pips?: number | null
          external_agreement?: string | null
          external_confidence?: number | null
          external_direction?: string | null
          forecast_date: string
          forecast_horizon_hours?: number
          hit_stop?: boolean | null
          hit_target?: boolean | null
          id?: string
          invalidation_reason?: string | null
          last_revalidated_at?: string | null
          median_mae_pips?: number | null
          median_move_pips?: number | null
          model_version?: string | null
          n_matches?: number | null
          news_context?: string | null
          p_down?: number | null
          p_flat?: number | null
          p_up?: number | null
          pattern_key?: string | null
          price_at_forecast: number
          probability: number
          reasoning?: string | null
          stat_source?: string | null
          status?: string
          stop_price?: number | null
          symbol: string
          target_price?: number | null
          technical_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          accuracy_score?: number | null
          actual_direction?: string | null
          actual_move_pips?: number | null
          adjustments_count?: number
          created_at?: string
          current_entry?: number | null
          current_stop?: number | null
          current_target?: number | null
          direction?: string
          evaluated_at?: string | null
          evaluation_notes?: string | null
          expected_move_pips?: number | null
          external_agreement?: string | null
          external_confidence?: number | null
          external_direction?: string | null
          forecast_date?: string
          forecast_horizon_hours?: number
          hit_stop?: boolean | null
          hit_target?: boolean | null
          id?: string
          invalidation_reason?: string | null
          last_revalidated_at?: string | null
          median_mae_pips?: number | null
          median_move_pips?: number | null
          model_version?: string | null
          n_matches?: number | null
          news_context?: string | null
          p_down?: number | null
          p_flat?: number | null
          p_up?: number | null
          pattern_key?: string | null
          price_at_forecast?: number
          probability?: number
          reasoning?: string | null
          stat_source?: string | null
          status?: string
          stop_price?: number | null
          symbol?: string
          target_price?: number | null
          technical_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_market_reviews: {
        Row: {
          ai_provider: string | null
          created_at: string
          id: string
          market_context: string
          pairs_analysis: Json
          raw_features: Json | null
          session: string
        }
        Insert: {
          ai_provider?: string | null
          created_at?: string
          id?: string
          market_context: string
          pairs_analysis?: Json
          raw_features?: Json | null
          session: string
        }
        Update: {
          ai_provider?: string | null
          created_at?: string
          id?: string
          market_context?: string
          pairs_analysis?: Json
          raw_features?: Json | null
          session?: string
        }
        Relationships: []
      }
      demo_accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          reset_at: string | null
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          reset_at?: string | null
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          reset_at?: string | null
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      demo_trades: {
        Row: {
          closed_at: string | null
          created_at: string
          entry: number
          exit_price: number | null
          expires_at: string
          id: string
          lot: number
          opened_at: string
          pair: string
          realized_pnl: number | null
          risk_usd: number
          side: string
          sl: number
          snapshot: Json | null
          source_ref: string | null
          source_type: string | null
          status: string
          tp: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          entry: number
          exit_price?: number | null
          expires_at?: string
          id?: string
          lot: number
          opened_at?: string
          pair: string
          realized_pnl?: number | null
          risk_usd: number
          side: string
          sl: number
          snapshot?: Json | null
          source_ref?: string | null
          source_type?: string | null
          status?: string
          tp: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          entry?: number
          exit_price?: number | null
          expires_at?: string
          id?: string
          lot?: number
          opened_at?: string
          pair?: string
          realized_pnl?: number | null
          risk_usd?: number
          side?: string
          sl?: number
          snapshot?: Json | null
          source_ref?: string | null
          source_type?: string | null
          status?: string
          tp?: number
          user_id?: string
        }
        Relationships: []
      }
      economic_events: {
        Row: {
          actual: string | null
          affected_symbols: string[] | null
          country: string | null
          created_at: string
          currency: string
          event_time: string
          external_id: string | null
          forecast: string | null
          id: string
          importance: string
          previous: string | null
          processed_at: string | null
          source: string | null
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          actual?: string | null
          affected_symbols?: string[] | null
          country?: string | null
          created_at?: string
          currency: string
          event_time: string
          external_id?: string | null
          forecast?: string | null
          id?: string
          importance?: string
          previous?: string | null
          processed_at?: string | null
          source?: string | null
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          actual?: string | null
          affected_symbols?: string[] | null
          country?: string | null
          created_at?: string
          currency?: string
          event_time?: string
          external_id?: string | null
          forecast?: string | null
          id?: string
          importance?: string
          previous?: string | null
          processed_at?: string | null
          source?: string | null
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      external_forecasts: {
        Row: {
          confidence: number | null
          created_at: string
          direction: string
          entry: number | null
          fetched_at: string
          forecast_date: string
          horizon_hours: number | null
          id: string
          raw: Json | null
          sl: number | null
          source: string
          symbol: string
          tp: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          direction: string
          entry?: number | null
          fetched_at?: string
          forecast_date?: string
          horizon_hours?: number | null
          id?: string
          raw?: Json | null
          sl?: number | null
          source?: string
          symbol: string
          tp?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          direction?: string
          entry?: number | null
          fetched_at?: string
          forecast_date?: string
          horizon_hours?: number | null
          id?: string
          raw?: Json | null
          sl?: number | null
          source?: string
          symbol?: string
          tp?: number | null
        }
        Relationships: []
      }
      forecast_adjustments: {
        Row: {
          atr_used: number | null
          created_at: string
          forecast_id: string
          id: string
          live_price: number | null
          new_entry: number | null
          new_stop: number | null
          new_target: number | null
          old_entry: number | null
          old_stop: number | null
          old_target: number | null
          reason: string
          symbol: string
        }
        Insert: {
          atr_used?: number | null
          created_at?: string
          forecast_id: string
          id?: string
          live_price?: number | null
          new_entry?: number | null
          new_stop?: number | null
          new_target?: number | null
          old_entry?: number | null
          old_stop?: number | null
          old_target?: number | null
          reason: string
          symbol: string
        }
        Update: {
          atr_used?: number | null
          created_at?: string
          forecast_id?: string
          id?: string
          live_price?: number | null
          new_entry?: number | null
          new_stop?: number | null
          new_target?: number | null
          old_entry?: number | null
          old_stop?: number | null
          old_target?: number | null
          reason?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_adjustments_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "daily_forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_revisions: {
        Row: {
          created_at: string
          event_id: string | null
          forecast_id: string
          id: string
          new_direction: string
          new_probability: number
          new_stop_price: number | null
          new_target_price: number | null
          prev_direction: string | null
          prev_probability: number | null
          price_at_revision: number | null
          reasoning: string | null
          symbol: string
          trigger: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          forecast_id: string
          id?: string
          new_direction: string
          new_probability: number
          new_stop_price?: number | null
          new_target_price?: number | null
          prev_direction?: string | null
          prev_probability?: number | null
          price_at_revision?: number | null
          reasoning?: string | null
          symbol: string
          trigger?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          forecast_id?: string
          id?: string
          new_direction?: string
          new_probability?: number
          new_stop_price?: number | null
          new_target_price?: number | null
          prev_direction?: string | null
          prev_probability?: number | null
          price_at_revision?: number | null
          reasoning?: string | null
          symbol?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_revisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "economic_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_revisions_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "daily_forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_stats: {
        Row: {
          avg_accuracy: number
          avg_probability: number
          correct_direction: number
          hit_stop_count: number
          hit_target_count: number
          id: string
          last_evaluated_at: string | null
          recent_mistakes: Json | null
          symbol: string
          total_forecasts: number
          updated_at: string
        }
        Insert: {
          avg_accuracy?: number
          avg_probability?: number
          correct_direction?: number
          hit_stop_count?: number
          hit_target_count?: number
          id?: string
          last_evaluated_at?: string | null
          recent_mistakes?: Json | null
          symbol: string
          total_forecasts?: number
          updated_at?: string
        }
        Update: {
          avg_accuracy?: number
          avg_probability?: number
          correct_direction?: number
          hit_stop_count?: number
          hit_target_count?: number
          id?: string
          last_evaluated_at?: string | null
          recent_mistakes?: Json | null
          symbol?: string
          total_forecasts?: number
          updated_at?: string
        }
        Relationships: []
      }
      forex_features: {
        Row: {
          adx_14: number | null
          atr_14: number | null
          calculated_at: string
          created_at: string | null
          ema_20: number | null
          ema_200: number | null
          ema_50: number | null
          id: string
          last_close: number
          pivot_pp: number | null
          pivot_r1: number | null
          pivot_r2: number | null
          pivot_s1: number | null
          pivot_s2: number | null
          round_levels: Json | null
          rsi_14: number | null
          session: string | null
          swing_highs: Json | null
          swing_lows: Json | null
          symbol: string
          timeframe: string
          trend_direction: string | null
        }
        Insert: {
          adx_14?: number | null
          atr_14?: number | null
          calculated_at?: string
          created_at?: string | null
          ema_20?: number | null
          ema_200?: number | null
          ema_50?: number | null
          id?: string
          last_close: number
          pivot_pp?: number | null
          pivot_r1?: number | null
          pivot_r2?: number | null
          pivot_s1?: number | null
          pivot_s2?: number | null
          round_levels?: Json | null
          rsi_14?: number | null
          session?: string | null
          swing_highs?: Json | null
          swing_lows?: Json | null
          symbol: string
          timeframe: string
          trend_direction?: string | null
        }
        Update: {
          adx_14?: number | null
          atr_14?: number | null
          calculated_at?: string
          created_at?: string | null
          ema_20?: number | null
          ema_200?: number | null
          ema_50?: number | null
          id?: string
          last_close?: number
          pivot_pp?: number | null
          pivot_r1?: number | null
          pivot_r2?: number | null
          pivot_s1?: number | null
          pivot_s2?: number | null
          round_levels?: Json | null
          rsi_14?: number | null
          session?: string | null
          swing_highs?: Json | null
          swing_lows?: Json | null
          symbol?: string
          timeframe?: string
          trend_direction?: string | null
        }
        Relationships: []
      }
      forex_ohlcv: {
        Row: {
          bar_timestamp: string
          close: number
          created_at: string | null
          high: number
          id: string
          low: number
          open: number
          symbol: string
          timeframe: string
          volume: number | null
        }
        Insert: {
          bar_timestamp: string
          close: number
          created_at?: string | null
          high: number
          id?: string
          low: number
          open: number
          symbol: string
          timeframe: string
          volume?: number | null
        }
        Update: {
          bar_timestamp?: string
          close?: number
          created_at?: string | null
          high?: number
          id?: string
          low?: number
          open?: number
          symbol?: string
          timeframe?: string
          volume?: number | null
        }
        Relationships: []
      }
      forex_prices: {
        Row: {
          ask: number | null
          bid: number | null
          created_at: string | null
          id: string
          price: number
          price_timestamp: string
          source: string | null
          spread: number | null
          symbol: string
          updated_at: string | null
          volume: number | null
        }
        Insert: {
          ask?: number | null
          bid?: number | null
          created_at?: string | null
          id?: string
          price: number
          price_timestamp?: string
          source?: string | null
          spread?: number | null
          symbol: string
          updated_at?: string | null
          volume?: number | null
        }
        Update: {
          ask?: number | null
          bid?: number | null
          created_at?: string | null
          id?: string
          price?: number
          price_timestamp?: string
          source?: string | null
          spread?: number | null
          symbol?: string
          updated_at?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      market_news: {
        Row: {
          created_at: string
          currency: string | null
          headline: string
          id: string
          impact: string | null
          published_at: string
          sentiment: number | null
          source: string | null
          summary: string | null
          symbol: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          headline: string
          id?: string
          impact?: string | null
          published_at: string
          sentiment?: number | null
          source?: string | null
          summary?: string | null
          symbol?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          headline?: string
          id?: string
          impact?: string | null
          published_at?: string
          sentiment?: number | null
          source?: string | null
          summary?: string | null
          symbol?: string | null
          url?: string | null
        }
        Relationships: []
      }
      market_snapshots: {
        Row: {
          adx_h1_bucket: string | null
          adx_h4_bucket: string | null
          atr_h1: number | null
          cot_bias: string | null
          created_at: string
          dist_ema200_atr_bucket: string | null
          dow: number | null
          id: number
          news_sentiment_bucket: string | null
          pattern_key: string
          price: number
          range_pos_bucket: string | null
          rsi_h1_bucket: string | null
          rsi_h4_bucket: string | null
          session: string | null
          snapshot_at: string
          symbol: string
          trend_d1: string | null
          trend_h1: string | null
          trend_h4: string | null
          trend_m15: string | null
        }
        Insert: {
          adx_h1_bucket?: string | null
          adx_h4_bucket?: string | null
          atr_h1?: number | null
          cot_bias?: string | null
          created_at?: string
          dist_ema200_atr_bucket?: string | null
          dow?: number | null
          id?: number
          news_sentiment_bucket?: string | null
          pattern_key: string
          price: number
          range_pos_bucket?: string | null
          rsi_h1_bucket?: string | null
          rsi_h4_bucket?: string | null
          session?: string | null
          snapshot_at: string
          symbol: string
          trend_d1?: string | null
          trend_h1?: string | null
          trend_h4?: string | null
          trend_m15?: string | null
        }
        Update: {
          adx_h1_bucket?: string | null
          adx_h4_bucket?: string | null
          atr_h1?: number | null
          cot_bias?: string | null
          created_at?: string
          dist_ema200_atr_bucket?: string | null
          dow?: number | null
          id?: number
          news_sentiment_bucket?: string | null
          pattern_key?: string
          price?: number
          range_pos_bucket?: string | null
          rsi_h1_bucket?: string | null
          rsi_h4_bucket?: string | null
          session?: string | null
          snapshot_at?: string
          symbol?: string
          trend_d1?: string | null
          trend_h1?: string | null
          trend_h4?: string | null
          trend_m15?: string | null
        }
        Relationships: []
      }
      news_blackouts: {
        Row: {
          created_at: string
          currency: string
          ends_at: string
          event_ref: string | null
          id: string
          impact: string | null
          reason: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          ends_at: string
          event_ref?: string | null
          id?: string
          impact?: string | null
          reason: string
          starts_at: string
        }
        Update: {
          created_at?: string
          currency?: string
          ends_at?: string
          event_ref?: string | null
          id?: string
          impact?: string | null
          reason?: string
          starts_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      signal_outcomes: {
        Row: {
          adx_at_entry: number | null
          atr_at_entry: number | null
          closed_at: string | null
          confidence: number | null
          entry: number
          exit_price: number | null
          expected_pnl: number | null
          expires_at: string
          id: string
          opened_at: string
          pair: string
          realized_pnl: number | null
          reason: string | null
          review_id: string | null
          rr: number | null
          side: string
          sl: number
          status: string
          surprise_ratio: number | null
          tp: number
          trigger: string | null
        }
        Insert: {
          adx_at_entry?: number | null
          atr_at_entry?: number | null
          closed_at?: string | null
          confidence?: number | null
          entry: number
          exit_price?: number | null
          expected_pnl?: number | null
          expires_at?: string
          id?: string
          opened_at?: string
          pair: string
          realized_pnl?: number | null
          reason?: string | null
          review_id?: string | null
          rr?: number | null
          side: string
          sl: number
          status?: string
          surprise_ratio?: number | null
          tp: number
          trigger?: string | null
        }
        Update: {
          adx_at_entry?: number | null
          atr_at_entry?: number | null
          closed_at?: string | null
          confidence?: number | null
          entry?: number
          exit_price?: number | null
          expected_pnl?: number | null
          expires_at?: string
          id?: string
          opened_at?: string
          pair?: string
          realized_pnl?: number | null
          reason?: string | null
          review_id?: string | null
          rr?: number | null
          side?: string
          sl?: number
          status?: string
          surprise_ratio?: number | null
          tp?: number
          trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "daily_market_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshot_outcomes: {
        Row: {
          computed_at: string
          direction_24h: string
          horizon_hours: number
          mae_atr: number | null
          mae_pips: number
          mfe_atr: number | null
          mfe_pips: number
          move_pips: number
          snapshot_id: number
        }
        Insert: {
          computed_at?: string
          direction_24h: string
          horizon_hours?: number
          mae_atr?: number | null
          mae_pips: number
          mfe_atr?: number | null
          mfe_pips: number
          move_pips: number
          snapshot_id: number
        }
        Update: {
          computed_at?: string
          direction_24h?: string
          horizon_hours?: number
          mae_atr?: number | null
          mae_pips?: number
          mfe_atr?: number | null
          mfe_pips?: number
          move_pips?: number
          snapshot_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_outcomes_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "market_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          last_credit_grant_period: string | null
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_credit_grant_period?: string | null
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_credit_grant_period?: string | null
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string | null
          credits_balance: number
          id: string
          last_purchase_at: string | null
          total_spent: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_balance?: number
          id?: string
          last_purchase_at?: string | null
          total_spent?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_balance?: number
          id?: string
          last_purchase_at?: string | null
          total_spent?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_latest_features: {
        Args: { p_symbol: string; p_timeframe: string }
        Returns: {
          adx_14: number
          atr_14: number
          calculated_at: string
          ema_20: number
          ema_200: number
          ema_50: number
          last_close: number
          pivot_pp: number
          pivot_r1: number
          pivot_r2: number
          pivot_s1: number
          pivot_s2: number
          round_levels: Json
          rsi_14: number
          session: string
          swing_highs: Json
          swing_lows: Json
          symbol: string
          timeframe: string
          trend_direction: string
        }[]
      }
      get_latest_forex_price: {
        Args: { p_symbol: string }
        Returns: {
          ask: number
          bid: number
          price: number
          price_timestamp: string
          source: string
          spread: number
          symbol: string
          volume: number
        }[]
      }
      get_latest_ohlcv: {
        Args: { p_count?: number; p_symbol: string; p_timeframe: string }
        Returns: {
          bar_timestamp: string
          close: number
          high: number
          low: number
          open: number
          volume: number
        }[]
      }
      is_currency_in_blackout: {
        Args: { p_at?: string; p_currency: string }
        Returns: boolean
      }
      upsert_forex_price: {
        Args: {
          p_ask?: number
          p_bid?: number
          p_price: number
          p_source?: string
          p_spread?: number
          p_symbol: string
          p_volume?: number
        }
        Returns: string
      }
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
