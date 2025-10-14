import { supabase } from "@/integrations/supabase/client";

export interface ForexFeatures {
  symbol: string;
  timeframe: string;
  calculated_at: string;
  last_close: number;
  ema_20: number;
  ema_50: number;
  ema_200: number;
  adx_14: number;
  rsi_14: number;
  atr_14: number;
  pivot_pp: number;
  pivot_r1: number;
  pivot_r2: number;
  pivot_s1: number;
  pivot_s2: number;
  swing_highs: number[];
  swing_lows: number[];
  round_levels: number[];
  session: string;
  trend_direction: "↗" | "↘" | "→";
}

export interface TrendMatrix {
  D1: "↗" | "↘" | "→";
  H4: "↗" | "↘" | "→";
  H1: "↗" | "↘" | "→";
  M15: "↗" | "↘" | "→";
}

// Fetch latest features for a symbol across all timeframes
export const getFeaturesBySymbol = async (symbol: string): Promise<Record<string, ForexFeatures>> => {
  const timeframes = ['D1', 'H4', 'H1', 'M15'];
  const features: Record<string, ForexFeatures> = {};

  await Promise.all(
    timeframes.map(async (timeframe) => {
      try {
        const { data, error } = await supabase
          .rpc('get_latest_features', { p_symbol: symbol, p_timeframe: timeframe });

        if (error) {
          console.error(`[Indicators] Error fetching ${symbol} ${timeframe}:`, error);
          return;
        }

        if (data && data.length > 0) {
          const feature = data[0];
          // Parse JSON fields
          feature.swing_highs = typeof feature.swing_highs === 'string' 
            ? JSON.parse(feature.swing_highs) 
            : feature.swing_highs || [];
          feature.swing_lows = typeof feature.swing_lows === 'string'
            ? JSON.parse(feature.swing_lows)
            : feature.swing_lows || [];
          feature.round_levels = typeof feature.round_levels === 'string'
            ? JSON.parse(feature.round_levels)
            : feature.round_levels || [];
          features[timeframe] = feature as ForexFeatures;
        }
      } catch (error) {
        console.error(`[Indicators] Exception for ${symbol} ${timeframe}:`, error);
      }
    })
  );

  return features;
};

// Get trend matrix from features
export const getTrendMatrix = (features: Record<string, ForexFeatures>): TrendMatrix => {
  return {
    D1: features['D1']?.trend_direction || '→',
    H4: features['H4']?.trend_direction || '→',
    H1: features['H1']?.trend_direction || '→',
    M15: features['M15']?.trend_direction || '→'
  };
};

// Calculate overall trend strength based on timeframe alignment
export const calculateTrendStrength = (trendMatrix: TrendMatrix): number => {
  const trends = [trendMatrix.D1, trendMatrix.H4, trendMatrix.H1, trendMatrix.M15];
  
  // Count aligned trends
  const upCount = trends.filter(t => t === '↗').length;
  const downCount = trends.filter(t => t === '↘').length;
  const maxCount = Math.max(upCount, downCount);
  
  // Strength is percentage of aligned timeframes
  return Math.round((maxCount / trends.length) * 100);
};

// Get overall trend direction
export const getOverallTrend = (trendMatrix: TrendMatrix): "↗" | "↘" | "→" => {
  const trends = [trendMatrix.D1, trendMatrix.H4, trendMatrix.H1, trendMatrix.M15];
  
  const upCount = trends.filter(t => t === '↗').length;
  const downCount = trends.filter(t => t === '↘').length;
  
  if (upCount > downCount && upCount >= 2) return '↗';
  if (downCount > upCount && downCount >= 2) return '↘';
  return '→';
};

// Fetch historical OHLCV data
export const fetchOHLCV = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-ohlcv');

    if (error) {
      console.error('[Indicators] Error calling fetch-ohlcv:', error);
      return { success: false, message: error.message };
    }

    console.log('[Indicators] OHLCV fetch result:', data);
    return { 
      success: true, 
      message: `Завантажено ${data.fetched} датасетів` 
    };
  } catch (error) {
    console.error('[Indicators] Exception calling fetch-ohlcv:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Calculate indicators
export const calculateIndicators = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('calculate-indicators');

    if (error) {
      console.error('[Indicators] Error calling calculate-indicators:', error);
      return { success: false, message: error.message };
    }

    console.log('[Indicators] Indicators calculation result:', data);
    return { 
      success: true, 
      message: `Обчислено ${data.calculated} індикаторів` 
    };
  } catch (error) {
    console.error('[Indicators] Exception calling calculate-indicators:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Full update pipeline: fetch OHLCV → calculate indicators
export const fullUpdate = async (): Promise<{ success: boolean; message: string }> => {
  console.log('[Indicators] Starting full update pipeline');
  
  // Step 1: Fetch OHLCV
  const ohlcvResult = await fetchOHLCV();
  if (!ohlcvResult.success) {
    return ohlcvResult;
  }

  // Wait a bit for data to settle
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Calculate indicators
  const indicatorsResult = await calculateIndicators();
  if (!indicatorsResult.success) {
    return indicatorsResult;
  }

  return {
    success: true,
    message: `${ohlcvResult.message} → ${indicatorsResult.message}`
  };
};
