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
  market_mode?: "trending" | "ranging"; // New field
}

export interface TrendMatrix {
  D1: "↗" | "↘" | "→";
  H4: "↗" | "↘" | "→";
  H1: "↗" | "↘" | "→";
  M15: "↗" | "↘" | "→";
}

export const getFeaturesBySymbol = async (symbol: string): Promise<Record<string, ForexFeatures>> => {
  const timeframes = ['D1', 'H4', 'H1', 'M15'];
  const features: Record<string, ForexFeatures> = {};

  await Promise.all(
    timeframes.map(async (timeframe) => {
      try {
        const { data, error } = await supabase
          .rpc('get_latest_features', { p_symbol: symbol, p_timeframe: timeframe });

        if (error || !data || data.length === 0) return;

        const feature = data[0];
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
      } catch (error) {
        // Пропускаємо помилки
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

// Determine market mode (trending vs ranging)
export const getMarketMode = (features: Record<string, ForexFeatures>): "trending" | "ranging" => {
  const h1Adx = features.H1?.adx_14 ?? 0;
  
  // Strong trend: H1 ADX >= 20
  if (h1Adx >= 20) return "trending";
  
  // Moderate trend: H1 ADX >= 15 AND at least 2 timeframes aligned
  if (h1Adx >= 15) {
    const trendMatrix = getTrendMatrix(features);
    const directions = [trendMatrix.D1, trendMatrix.H4, trendMatrix.H1, trendMatrix.M15];
    const upCount = directions.filter(d => d === "↗").length;
    const downCount = directions.filter(d => d === "↘").length;
    
    // If at least 2 TFs agree on direction, it's trending
    if (upCount >= 2 || downCount >= 2) return "trending";
  }
  
  return "ranging";
};

// Генерація торгових сигналів (range + trend)
export const generateRangeSignals = (
  price: number,
  features: ForexFeatures,
  mode: "rule" | "hybrid",
  context?: {
    marketMode?: "trending" | "ranging";
    overallTrend?: "↗" | "↘" | "→";
    strength?: number;
  }
): Array<{
  type: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2?: number;
  prob: number;
  source: string;
  notes?: string;
}> => {
  const signals = [];
  if (!features) return signals;
  
  const { pivot_s1, pivot_s2, pivot_r1, pivot_r2, pivot_pp, rsi_14, adx_14 } = features;
  const atr = features.atr_14 || 0;
  const symbol = features.symbol || '';
  const isJpy = symbol.includes('/JPY') || symbol.endsWith('JPY');
  const pipStep = isJpy ? 0.05 : 0.0005;
  const slDistance = Math.max(atr * 2, pipStep * 5);
  
  // Trending mode з сильним ADX
  if (context?.marketMode === "trending" && adx_14 >= 15 && context.overallTrend !== '→') {
    const isBuy = context.overallTrend === '↗';
    const baseProb = Math.min(50 + (context.strength || 0), 75);
    
    signals.push({
      type: isBuy ? "buy_stop" : "sell_stop",
      entry: isBuy ? price + 0.002 : price - 0.002,
      sl: isBuy ? price - 0.001 : price + 0.001,
      tp1: isBuy ? price + 0.004 : price - 0.004,
      tp2: isBuy ? price + 0.006 : price - 0.006,
      prob: baseProb,
      source: "Rule-Only",
      notes: `Тренд: ADX ${adx_14.toFixed(1)}, RSI ${rsi_14.toFixed(1)}`,
    });
    
    if (mode === "hybrid") {
      signals.push({
        type: isBuy ? "buy_stop" : "sell_stop",
        entry: isBuy ? price + 0.002 : price - 0.002,
        sl: isBuy ? price - 0.001 : price + 0.001,
        tp1: isBuy ? price + 0.004 : price - 0.004,
        tp2: isBuy ? price + 0.006 : price - 0.006,
        prob: Math.min(baseProb + 10, 85),
        source: "Rule+AI",
        notes: `Узгоджений тренд на ${context.strength}%`,
      });
    }
    
    return signals;
  }
  
  // Range mode - торгівля від рівнів
  // В hybrid режимі range-сигнали не генеруємо - чекаємо AI
  if (mode === "rule") {
    const source = "Rule-Only";
    
    // BUY від підтримки
    const buyProb = rsi_14 < 40 ? 75 : rsi_14 < 50 ? 65 : 55;
    signals.push({
      type: "buy_limit",
      entry: pivot_s1,
      sl: pivot_s2 || (pivot_s1 - slDistance),
      tp1: pivot_pp,
      tp2: pivot_r1,
      prob: buyProb,
      source,
      notes: `S1→PP, RSI: ${rsi_14.toFixed(0)}`,
    });
    
    // SELL від опору
    const sellProb = rsi_14 > 60 ? 75 : rsi_14 > 50 ? 65 : 55;
    signals.push({
      type: "sell_limit",
      entry: pivot_r1,
      sl: pivot_r2 || (pivot_r1 + slDistance),
      tp1: pivot_pp,
      tp2: pivot_s1,
      prob: sellProb,
      source,
      notes: `R1→PP, RSI: ${rsi_14.toFixed(0)}`,
    });
  }
  
  return signals;
};

export const fetchOHLCV = async (superMode = false): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-ohlcv', {
      body: { superMode }
    });

    if (error) {
      const msg = (error as any)?.message || String(error);
      if (msg?.toLowerCase().includes('failed to fetch') || msg?.toLowerCase().includes('network')) {
        return {
          success: true,
          message: 'Фонове завантаження свічок запущено. Перше завантаження може тривати до 20 хвилин.'
        };
      }
      return { success: false, message: msg };
    }
    
    const modeLabel = superMode ? 'СУПЕР режим' : 'Базовий режим';
    const message = `${modeLabel}: ${data.fetched} датасетів${data.failed > 0 ? ` (помилок: ${data.failed})` : ''}`;
    
    return { success: true, message };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
      return {
        success: true,
        message: 'Фонове завантаження свічок триває.'
      };
    }
    return { success: false, message: msg };
  }
};

export const calculateIndicators = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('calculate-indicators');
    if (error) return { success: false, message: error.message };
    
    return { 
      success: true, 
      message: `Обчислено ${data.calculated} індикаторів` 
    };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

export const fullUpdate = async (superMode = false): Promise<{ success: boolean; message: string }> => {
  const ohlcvResult = await fetchOHLCV(superMode);
  if (!ohlcvResult.success) return ohlcvResult;

  if (ohlcvResult.message.includes('Фонове') || ohlcvResult.message.includes('триває')) {
    return {
      success: true,
      message: ohlcvResult.message + ' Індикатори будуть розраховані автоматично.'
    };
  }

  return {
    success: true,
    message: ohlcvResult.message + ' Індикатори оновлено.'
  };
};
