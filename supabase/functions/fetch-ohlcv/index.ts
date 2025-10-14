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
    let isInitialLoad = false;

    console.log('[FetchOHLCV] Starting OHLCV fetch');

    // Check if we have any data - if not, this is initial load
    const { count } = await supabase
      .from('forex_ohlcv')
      .select('*', { count: 'exact', head: true });
    
    isInitialLoad = !count || count === 0;
    console.log(`[FetchOHLCV] Mode: ${isInitialLoad ? 'INITIAL LOAD' : 'UPDATE'}`);

    for (const symbol of pairs) {
      for (const [timeframe, config] of Object.entries(TIMEFRAME_CONFIG)) {
        try {
          // For updates, only fetch 2 most recent bars
          const fetchCount = isInitialLoad ? config.count : 2;
          
          console.log(`[FetchOHLCV] Fetching ${symbol} ${timeframe} (${fetchCount} bars)`);

          const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${config.interval}&outputsize=${fetchCount}&apikey=${encodeURIComponent(TWELVE_DATA_KEY)}`;
          const response = await fetch(url);

          if (!response.ok) {
            console.error(`[FetchOHLCV] API error: ${response.status}`);
            results.push({ symbol, timeframe, status: 'error', message: `API ${response.status}` });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay on error
            continue;
          }

          const data = await response.json();

          if (data.code === 429) {
            console.error('[FetchOHLCV] Rate limit hit');
            results.push({ symbol, timeframe, status: 'rate_limit' });
            await new Promise(resolve => setTimeout(resolve, 2000)); // Long delay on rate limit
            continue;
          }

          if (!data.values || !Array.isArray(data.values)) {
            console.error(`[FetchOHLCV] Invalid data for ${symbol} ${timeframe}`);
            results.push({ symbol, timeframe, status: 'invalid_data' });
            await new Promise(resolve => setTimeout(resolve, 1000));
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

          // Smart delay based on mode
          const delay = isInitialLoad ? 800 : 500; // Longer delay for initial load
          await new Promise(resolve => setTimeout(resolve, delay));

        } catch (error) {
          console.error(`[FetchOHLCV] Error for ${symbol} ${timeframe}:`, error);
          results.push({ 
            symbol, 
            timeframe, 
            status: 'error', 
            message: error instanceof Error ? error.message : 'Unknown' 
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status !== 'success').length;

    console.log(`[FetchOHLCV] Complete: ${successCount} success, ${failCount} failed (${isInitialLoad ? 'initial load' : 'update'})`);

    return new Response(
      JSON.stringify({ 
        success: true,
        mode: isInitialLoad ? 'initial' : 'update',
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
