import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Create Supabase client with service role for DB access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Major currency pairs to update
    const pairs = [
      'EUR/USD',
      'GBP/USD',
      'USD/JPY',
      'USD/CHF',
      'AUD/USD',
      'NZD/USD',
      'USD/CAD'
    ];

    const results = [];
    let successCount = 0;
    let failCount = 0;

    console.log(`[UpdateForex] Starting update for ${pairs.length} pairs`);

    for (const symbol of pairs) {
      try {
        // Fetch from Twelve Data API
        const response = await fetch(
          `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(TWELVE_DATA_KEY)}`
        );

        if (!response.ok) {
          console.error(`[UpdateForex] API error for ${symbol}: ${response.status}`);
          failCount++;
          results.push({ symbol, status: 'error', message: `API returned ${response.status}` });
          continue;
        }

        const data = await response.json();

        if (data.code === 429) {
          console.error(`[UpdateForex] Rate limit hit for ${symbol}`);
          failCount++;
          results.push({ symbol, status: 'rate_limit', message: 'Rate limit exceeded' });
          continue;
        }

        if (!data.close) {
          console.error(`[UpdateForex] Invalid data for ${symbol}:`, data);
          failCount++;
          results.push({ symbol, status: 'invalid_data', message: 'No price data' });
          continue;
        }

        const price = Number(data.close);
        const bid = price * 0.9999;
        const ask = price * 1.0001;
        const volume = Number(data.volume || 0);
        const spread = price * 0.0002;

        // Insert into database using the upsert function
        const { data: insertData, error: insertError } = await supabase.rpc('upsert_forex_price', {
          p_symbol: symbol,
          p_price: price,
          p_bid: bid,
          p_ask: ask,
          p_volume: volume,
          p_spread: spread,
          p_source: 'twelve_data'
        });

        if (insertError) {
          console.error(`[UpdateForex] DB error for ${symbol}:`, insertError);
          failCount++;
          results.push({ symbol, status: 'db_error', message: insertError.message });
        } else {
          console.log(`[UpdateForex] ✅ Updated ${symbol}: ${price}`);
          successCount++;
          results.push({ symbol, status: 'success', price });
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`[UpdateForex] Error processing ${symbol}:`, error);
        failCount++;
        results.push({ 
          symbol, 
          status: 'error', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    console.log(`[UpdateForex] Complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        updated: successCount,
        failed: failCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UpdateForex] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
