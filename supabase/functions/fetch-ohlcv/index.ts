import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeframe configuration
const TIMEFRAME_CONFIG = {
  'D1': { interval: '1day', count: 50 },
  'H4': { interval: '4h', count: 100 },
  'H1': { interval: '1h', count: 200 },
  'M15': { interval: '15min', count: 100 }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TWELVE_DATA_KEY = Deno.env.get('TWELVE_DATA_API_KEY');
    if (!TWELVE_DATA_KEY) {
      return new Response(
        JSON.stringify({ error: 'Twelve Data API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'];
    const results = [];

    console.log('[FetchOHLCV] Starting OHLCV fetch');

    for (const symbol of pairs) {
      for (const [timeframe, config] of Object.entries(TIMEFRAME_CONFIG)) {
        try {
          console.log(`[FetchOHLCV] Fetching ${symbol} ${timeframe}`);

          // Fetch time series from Twelve Data
          const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${config.interval}&outputsize=${config.count}&apikey=${encodeURIComponent(TWELVE_DATA_KEY)}`;
          const response = await fetch(url);

          if (!response.ok) {
            console.error(`[FetchOHLCV] API error: ${response.status}`);
            results.push({ symbol, timeframe, status: 'error', message: `API ${response.status}` });
            continue;
          }

          const data = await response.json();

          if (data.code === 429) {
            console.error('[FetchOHLCV] Rate limit hit');
            results.push({ symbol, timeframe, status: 'rate_limit' });
            continue;
          }

          if (!data.values || !Array.isArray(data.values)) {
            console.error(`[FetchOHLCV] Invalid data for ${symbol} ${timeframe}`);
            results.push({ symbol, timeframe, status: 'invalid_data' });
            continue;
          }

          // Insert bars into database
          const bars = data.values.map((bar: any) => ({
            symbol,
            timeframe,
            bar_timestamp: bar.datetime,
            open: parseFloat(bar.open),
            high: parseFloat(bar.high),
            low: parseFloat(bar.low),
            close: parseFloat(bar.close),
            volume: parseInt(bar.volume || '0')
          }));

          // Upsert bars (insert or ignore duplicates)
          const { error: insertError } = await supabase
            .from('forex_ohlcv')
            .upsert(bars, { 
              onConflict: 'symbol,timeframe,bar_timestamp',
              ignoreDuplicates: true 
            });

          if (insertError) {
            console.error(`[FetchOHLCV] DB error for ${symbol} ${timeframe}:`, insertError);
            results.push({ symbol, timeframe, status: 'db_error', message: insertError.message });
          } else {
            console.log(`[FetchOHLCV] ✅ Saved ${bars.length} bars for ${symbol} ${timeframe}`);
            results.push({ symbol, timeframe, status: 'success', bars: bars.length });
          }

          // Delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.error(`[FetchOHLCV] Error for ${symbol} ${timeframe}:`, error);
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
    const failCount = results.filter(r => r.status !== 'success').length;

    console.log(`[FetchOHLCV] Complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        fetched: successCount,
        failed: failCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FetchOHLCV] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
