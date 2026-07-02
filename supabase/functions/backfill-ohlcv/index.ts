import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TF_TO_INTERVAL: Record<string, string> = {
  D1: '1day', H4: '4h', H1: '1h', M15: '15min',
};

// bars per one calendar day (approximate, FX ~5 sessions/week)
const BARS_PER_DAY: Record<string, number> = {
  D1: 5 / 7, H4: (5 / 7) * 6, H1: (5 / 7) * 24, M15: (5 / 7) * 24 * 4,
};

// Default depth per timeframe
const DEFAULT_DEPTH_DAYS: Record<string, number> = {
  D1: 365 * 15,
  H4: 365 * 5,
  H1: 365 * 2,
  M15: 180,
};

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'];
const CHUNK_SIZE = 5000; // Twelve Data max outputsize
const RATE_DELAY_MS = 9000; // 8 req/min => ~7.5s. use 9s to be safe

function fmt(d: Date) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function runInBackground(p: Promise<any>) {
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p);
  else p.catch((e) => console.error('[backfill] bg err', e));
}

async function fetchTD(url: string, tries = 3): Promise<any> {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j?.code === 429 && i < tries) {
        await new Promise((res) => setTimeout(res, 15000 * i));
        continue;
      }
      return j;
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const pairs: string[] = Array.isArray(body.pairs) && body.pairs.length ? body.pairs : PAIRS;
    const timeframes: string[] = Array.isArray(body.timeframes) && body.timeframes.length
      ? body.timeframes : ['D1', 'H4', 'H1', 'M15'];
    const customFrom = body.from ? new Date(body.from) : null;
    const customTo = body.to ? new Date(body.to) : new Date();

    const TWELVE_KEY = Deno.env.get('TWELVE_DATA_API_KEY');
    if (!TWELVE_KEY) {
      return new Response(JSON.stringify({ error: 'TWELVE_DATA_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Build jobs list
    const jobs: Array<{ symbol: string; timeframe: string; from: Date; to: Date }> = [];
    for (const symbol of pairs) {
      for (const tf of timeframes) {
        if (!TF_TO_INTERVAL[tf]) continue;
        const to = customTo;
        const from = customFrom
          ?? new Date(to.getTime() - DEFAULT_DEPTH_DAYS[tf] * 86400_000);
        jobs.push({ symbol, timeframe: tf, from, to });
      }
    }

    // Insert job records so UI can track progress
    const jobRows = jobs.map((j) => ({
      symbol: j.symbol,
      timeframe: j.timeframe,
      from_ts: j.from.toISOString(),
      to_ts: j.to.toISOString(),
      status: 'pending' as const,
      est_total_bars: Math.round(BARS_PER_DAY[j.timeframe] * ((j.to.getTime() - j.from.getTime()) / 86400_000)),
    }));
    const { data: inserted, error: insErr } = await supabase
      .from('backfill_jobs').insert(jobRows).select('id, symbol, timeframe');
    if (insErr) console.error('[backfill] insert jobs err', insErr);

    const jobIdMap = new Map<string, string>();
    inserted?.forEach((r: any) => jobIdMap.set(`${r.symbol}_${r.timeframe}`, r.id));

    runInBackground((async () => {
      for (const j of jobs) {
        const jobId = jobIdMap.get(`${j.symbol}_${j.timeframe}`);
        const interval = TF_TO_INTERVAL[j.timeframe];
        let done = 0;
        let lastTs: string | null = null;
        try {
          if (jobId) await supabase.from('backfill_jobs').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', jobId);

          // Walk from newest → oldest in CHUNK_SIZE chunks
          let cursorEnd = new Date(j.to);
          while (cursorEnd > j.from) {
            const url = `https://api.twelvedata.com/time_series`
              + `?symbol=${encodeURIComponent(j.symbol)}`
              + `&interval=${interval}`
              + `&start_date=${encodeURIComponent(fmt(j.from))}`
              + `&end_date=${encodeURIComponent(fmt(cursorEnd))}`
              + `&outputsize=${CHUNK_SIZE}`
              + `&order=DESC`
              + `&format=JSON`
              + `&apikey=${encodeURIComponent(TWELVE_KEY)}`;

            console.log(`[backfill] ${j.symbol} ${j.timeframe} end=${fmt(cursorEnd)}`);
            const data = await fetchTD(url);

            if (data?.code && data.code !== 200) {
              throw new Error(`TD ${data.code}: ${data.message ?? 'unknown'}`);
            }
            if (!Array.isArray(data?.values) || data.values.length === 0) {
              console.log(`[backfill] no more data for ${j.symbol} ${j.timeframe}`);
              break;
            }

            const bars = data.values.map((b: any) => ({
              symbol: j.symbol,
              timeframe: j.timeframe,
              bar_timestamp: b.datetime,
              open: parseFloat(b.open),
              high: parseFloat(b.high),
              low: parseFloat(b.low),
              close: parseFloat(b.close),
              volume: parseInt(b.volume || '0'),
            }));

            const { error: upErr } = await supabase
              .from('forex_ohlcv')
              .upsert(bars, { onConflict: 'symbol,timeframe,bar_timestamp', ignoreDuplicates: true });
            if (upErr) throw new Error(`DB upsert: ${upErr.message}`);

            done += bars.length;
            // oldest bar timestamp (values are DESC)
            const oldest = bars[bars.length - 1].bar_timestamp;
            lastTs = oldest;

            if (jobId) {
              await supabase.from('backfill_jobs').update({
                done_bars: done,
                last_ts: new Date(oldest).toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('id', jobId);
            }

            const oldestDate = new Date(oldest);
            if (oldestDate <= j.from || bars.length < CHUNK_SIZE) break;
            // move cursor 1s before oldest
            cursorEnd = new Date(oldestDate.getTime() - 1000);

            await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
          }

          if (jobId) await supabase.from('backfill_jobs').update({
            status: 'done', done_bars: done, updated_at: new Date().toISOString(),
          }).eq('id', jobId);
          console.log(`[backfill] ✅ ${j.symbol} ${j.timeframe}: ${done} bars`);
        } catch (e) {
          console.error(`[backfill] ❌ ${j.symbol} ${j.timeframe}`, e);
          if (jobId) await supabase.from('backfill_jobs').update({
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            done_bars: done,
            updated_at: new Date().toISOString(),
          }).eq('id', jobId);
        }
        await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
      }
    })());

    return new Response(JSON.stringify({
      success: true,
      queued: jobs.length,
      message: `Backfill запущено у фоні: ${jobs.length} задач(і). Прогрес — у таблиці backfill_jobs.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[backfill] fatal', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
