import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TF_TO_INTERVAL: Record<string, string> = {
  D1: '1day', H4: '4h', H1: '1h', M15: '15min',
};

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'];
const RATE_DELAY_MS = 9000;

function isWeekendClosed(): boolean {
  // FX opens Sun 22:00 UTC, closes Fri 22:00 UTC.
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const h = now.getUTCHours();
  if (dow === 6) return true;                  // Saturday
  if (dow === 5 && h >= 22) return true;       // Fri after 22:00 UTC
  if (dow === 0 && h < 22) return true;        // Sun before 22:00 UTC
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const timeframes: string[] = Array.isArray(body.timeframes) && body.timeframes.length
      ? body.timeframes : ['M15'];
    const pairs: string[] = Array.isArray(body.pairs) && body.pairs.length ? body.pairs : PAIRS;
    const barsToFetch = Number(body.bars) || 3;

    if (isWeekendClosed() && !body.force) {
      return new Response(JSON.stringify({ skipped: true, reason: 'weekend' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const TWELVE_KEY = Deno.env.get('TWELVE_DATA_API_KEY');
    if (!TWELVE_KEY) {
      return new Response(JSON.stringify({ error: 'TWELVE_DATA_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const results: any[] = [];
    for (const symbol of pairs) {
      for (const tf of timeframes) {
        const interval = TF_TO_INTERVAL[tf];
        if (!interval) continue;
        try {
          const url = `https://api.twelvedata.com/time_series`
            + `?symbol=${encodeURIComponent(symbol)}`
            + `&interval=${interval}`
            + `&outputsize=${barsToFetch}`
            + `&apikey=${encodeURIComponent(TWELVE_KEY)}`;
          const r = await fetch(url);
          const data = await r.json();
          if (data?.code === 429) {
            results.push({ symbol, tf, status: 'rate_limit' });
            await new Promise((res) => setTimeout(res, RATE_DELAY_MS * 2));
            continue;
          }
          if (!Array.isArray(data?.values)) {
            results.push({ symbol, tf, status: 'no_values', code: data?.code });
            await new Promise((res) => setTimeout(res, RATE_DELAY_MS));
            continue;
          }
          const bars = data.values.map((b: any) => ({
            symbol, timeframe: tf,
            bar_timestamp: b.datetime,
            open: parseFloat(b.open),
            high: parseFloat(b.high),
            low: parseFloat(b.low),
            close: parseFloat(b.close),
            volume: parseInt(b.volume || '0'),
          }));
          const { error } = await supabase.from('forex_ohlcv')
            .upsert(bars, { onConflict: 'symbol,timeframe,bar_timestamp' });
          if (error) results.push({ symbol, tf, status: 'db_err', message: error.message });
          else results.push({ symbol, tf, status: 'ok', bars: bars.length });
          await new Promise((res) => setTimeout(res, RATE_DELAY_MS));
        } catch (e) {
          results.push({ symbol, tf, status: 'err', message: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[ingest-recent] fatal', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
