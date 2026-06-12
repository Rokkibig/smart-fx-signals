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
    PostgrestVersion: "13.0.5"
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
    Enums: {},
  },
} as const
