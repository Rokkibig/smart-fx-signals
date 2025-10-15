import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate EMA
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  ema[0] = data[0];
  
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  
  return ema;
}

// Calculate RSI
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate ATR
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  
  return atr;
}

// Calculate ADX (proper implementation)
function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period * 2) return 0;
  
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  // Calculate TR, +DM, -DM
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
    
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  if (trueRanges.length < period) return 0;
  
  // Calculate smoothed TR, +DM, -DM
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
  }
  
  if (smoothedTR === 0) return 0;
  
  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;
  
  if (plusDI + minusDI === 0) return 0;
  
  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
  
  return dx;
}

// Calculate Pivot Points
function calculatePivots(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const r2 = pp + (high - low);
  const s1 = 2 * pp - high;
  const s2 = pp - (high - low);
  
  return { pp, r1, r2, s1, s2 };
}

// Find swing highs/lows
function findSwings(highs: number[], lows: number[], lookback: number = 5): { highs: number[], lows: number[] } {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  
  for (let i = lookback; i < highs.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    
    if (isHigh) swingHighs.push(highs[i]);
    if (isLow) swingLows.push(lows[i]);
  }
  
  return { 
    highs: swingHighs.slice(-5), 
    lows: swingLows.slice(-5) 
  };
}

// Calculate round levels
function calculateRoundLevels(price: number): number[] {
  const base = Math.floor(price * 100) / 100;
  const levels: number[] = [];
  
  for (let i = -2; i <= 2; i++) {
    levels.push(parseFloat((base + i * 0.005).toFixed(5)));
  }
  
  return levels;
}

// Determine session
function getSession(): string {
  const hour = new Date().getUTCHours();
  
  if (hour >= 0 && hour < 8) return 'Asia';
  if (hour >= 8 && hour < 16) return 'London';
  return 'NY';
}

// Determine trend
function determineTrend(ema50: number, ema200: number, price: number, adx: number): string {
  if (ema50 > ema200 && adx > 20 && price > ema50) return '↗';
  if (ema50 < ema200 && adx > 20 && price < ema50) return '↘';
  return '→';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'];
    const timeframes = ['D1', 'H4', 'H1', 'M15'];
    const results = [];

    console.log('[CalculateIndicators] Starting calculation');

    for (const symbol of pairs) {
      for (const timeframe of timeframes) {
        try {
// Get OHLCV data - need enough for indicators
const count = timeframe === 'D1' ? 200 : timeframe === 'H4' ? 400 : timeframe === 'H1' ? 600 : 600;

const { data: bars, error } = await supabase
  .rpc('get_latest_ohlcv', { 
    p_symbol: symbol, 
    p_timeframe: timeframe, 
    p_count: count 
  });

          if (error || !bars || bars.length === 0) {
            console.log(`[CalculateIndicators] No data for ${symbol} ${timeframe}`);
            continue;
          }
          
// Skip if not enough data for calculations
const minRequired = timeframe === 'D1' ? 120 : 200;
if (bars.length < minRequired) {
  console.log(`[CalculateIndicators] Insufficient data for ${symbol} ${timeframe}: ${bars.length}/${minRequired} bars`);
  continue;
}

          // Reverse to chronological order (oldest first)
          bars.reverse();

          const closes = bars.map((b: any) => parseFloat(b.close));
          const highs = bars.map((b: any) => parseFloat(b.high));
          const lows = bars.map((b: any) => parseFloat(b.low));
          const lastClose = closes[closes.length - 1];

          // Calculate indicators
          const ema20 = calculateEMA(closes, 20);
          const ema50 = calculateEMA(closes, 50);
          const ema200 = calculateEMA(closes, 200);
          
          const rsi14 = calculateRSI(closes, 14);
          const atr14 = calculateATR(highs, lows, closes, 14);
          const adx14 = calculateADX(highs, lows, closes, 14);
          
          const pivots = calculatePivots(
            highs[highs.length - 1],
            lows[lows.length - 1],
            closes[closes.length - 1]
          );
          
          const swings = findSwings(highs, lows);
          const roundLevels = calculateRoundLevels(lastClose);
          const session = getSession();
          const trendDirection = determineTrend(
            ema50[ema50.length - 1],
            ema200[ema200.length - 1],
            lastClose,
            adx14
          );

          // Insert features
          const { error: insertError } = await supabase
            .from('forex_features')
            .insert({
              symbol,
              timeframe,
              calculated_at: new Date().toISOString(),
              last_close: lastClose,
              ema_20: ema20[ema20.length - 1],
              ema_50: ema50[ema50.length - 1],
              ema_200: ema200[ema200.length - 1],
              adx_14: adx14,
              rsi_14: rsi14,
              atr_14: atr14,
              pivot_pp: pivots.pp,
              pivot_r1: pivots.r1,
              pivot_r2: pivots.r2,
              pivot_s1: pivots.s1,
              pivot_s2: pivots.s2,
              swing_highs: JSON.stringify(swings.highs),
              swing_lows: JSON.stringify(swings.lows),
              round_levels: JSON.stringify(roundLevels),
              session,
              trend_direction: trendDirection
            });

          if (insertError) {
            console.error(`[CalculateIndicators] DB error:`, insertError);
            results.push({ symbol, timeframe, status: 'error', message: insertError.message });
          } else {
            console.log(`[CalculateIndicators] ✅ ${symbol} ${timeframe}: ${trendDirection}`);
            results.push({ symbol, timeframe, status: 'success', trend: trendDirection });
          }

        } catch (error) {
          console.error(`[CalculateIndicators] Error:`, error);
          results.push({ 
            symbol, 
            timeframe, 
            status: 'error', 
            message: error instanceof Error ? error.message : 'Unknown' 
          });
        }
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;

    return new Response(
      JSON.stringify({ 
        success: true,
        calculated: successCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CalculateIndicators] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
