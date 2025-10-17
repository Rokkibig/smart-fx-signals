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

// Generate range trading signals - завжди генерує сигнали
export const generateRangeSignals = (
  price: number,
  features: ForexFeatures,
  mode: "rule" | "hybrid"
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
  const slDistance = Math.max((atr || 0) * 2, pipStep * 5);
  
  const source = mode === "rule" ? "Rule-Only" : "Hybrid";
  
  // ЗАВЖДИ генеруємо BUY сигнал від підтримки
  let buyProb = 55;
  if (rsi_14 < 40) buyProb = 75;
  else if (rsi_14 < 50) buyProb = 65;
  
  signals.push({
    type: "buy_limit",
    entry: pivot_s1,
    sl: pivot_s2 || (pivot_s1 - slDistance),
    tp1: pivot_pp,
    tp2: pivot_r1,
    prob: buyProb,
    source: source,
    notes: `Buy від S1. Поточна ціна: ${price.toFixed(isJpy ? 3 : 5)}, RSI: ${rsi_14.toFixed(0)}`
  });
  
  // ЗАВЖДИ генеруємо SELL сигнал від опору
  let sellProb = 55;
  if (rsi_14 > 60) sellProb = 75;
  else if (rsi_14 > 50) sellProb = 65;
  
  signals.push({
    type: "sell_limit",
    entry: pivot_r1,
    sl: pivot_r2 || (pivot_r1 + slDistance),
    tp1: pivot_pp,
    tp2: pivot_s1,
    prob: sellProb,
    source: source,
    notes: `Sell від R1. Поточна ціна: ${price.toFixed(isJpy ? 3 : 5)}, RSI: ${rsi_14.toFixed(0)}`
  });
  
  // Додатковий сигнал від PP якщо ADX низький (флет)
  if (adx_14 < 25) {
    if (price < pivot_pp) {
      signals.push({
        type: "buy_limit",
        entry: pivot_pp,
        sl: pivot_s1,
        tp1: pivot_r1,
        prob: 60,
        source: source,
        notes: `Buy від PP (флет, ADX: ${adx_14.toFixed(0)})`
      });
    } else {
      signals.push({
        type: "sell_limit",
        entry: pivot_pp,
        sl: pivot_r1,
        tp1: pivot_s1,
        prob: 60,
        source: source,
        notes: `Sell від PP (флет, ADX: ${adx_14.toFixed(0)})`
      });
    }
  }
  
  return signals;
};

// Fetch historical OHLCV data
export const fetchOHLCV = async (superMode = false): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-ohlcv', {
      body: { superMode }
    });

    if (error) {
      console.error('[Indicators] Error calling fetch-ohlcv:', error);
      const msg = (error as any)?.message || String(error);
      // Treat network timeouts as background execution success
      if (msg?.toLowerCase().includes('failed to fetch') || msg?.toLowerCase().includes('network')) {
        console.warn('[Indicators] fetch-ohlcv likely still running in background, proceeding...');
        return {
          success: true,
          message: 'Фонове завантаження свічок запущено. Перше завантаження може тривати до 20 хвилин.'
        };
      }
      return { success: false, message: msg };
    }

    console.log('[Indicators] OHLCV fetch result:', data);
    
    const modeLabel = superMode ? 'СУПЕР режим' : 'Базовий режим';
    const message = `${modeLabel}: ${data.fetched} датасетів${data.failed > 0 ? ` (помилок: ${data.failed})` : ''}`;
    
    return { 
      success: true, 
      message 
    };
  } catch (error) {
    console.error('[Indicators] Exception calling fetch-ohlcv:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
      console.warn('[Indicators] fetch-ohlcv exception but likely running; continuing...');
      return {
        success: true,
        message: 'Фонове завантаження свічок триває. Оновлення індикаторів буде виконано автоматично.'
      };
    }
    return { 
      success: false, 
      message: msg 
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
export const fullUpdate = async (superMode = false): Promise<{ success: boolean; message: string }> => {
  console.log(`[Indicators] Starting full update (${superMode ? 'СУПЕР' : 'базовий'} режим)`);
  
  // Step 1: Fetch OHLCV
  const ohlcvResult = await fetchOHLCV(superMode);
  if (!ohlcvResult.success) {
    return ohlcvResult;
  }

  // If fetch timed out (running in background), indicators will be calculated automatically on server
  if (ohlcvResult.message.includes('Фонове') || ohlcvResult.message.includes('триває')) {
    return {
      success: true,
      message: ohlcvResult.message + ' Індикатори будуть розраховані автоматично.'
    };
  }

  // If fetch completed successfully, indicators were already calculated on server
  return {
    success: true,
    message: ohlcvResult.message + ' Індикатори оновлено.'
  };
};
