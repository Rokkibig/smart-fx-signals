// Backfill market_snapshots + snapshot_outcomes from historical H1 OHLC.
// Pure statistical — no AI. For each H1 bar, compute indicators on the fly,
// build pattern_key, then look forward 24h and record outcome.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","NZD/USD","USD/CAD"];

function pipSize(sym: string) { return sym.includes("JPY") ? 0.01 : 0.0001; }

function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = vals[0];
  out.push(prev);
  for (let i = 1; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function atr(bars: {high:number;low:number;close:number}[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { trs.push(bars[i].high - bars[i].low); continue; }
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i-1].close),
      Math.abs(bars[i].low - bars[i-1].close),
    );
    trs.push(tr);
  }
  const out: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  out[period - 1] = sum / period;
  for (let i = period; i < bars.length; i++) {
    out[i] = (out[i-1] * (period - 1) + trs[i]) / period;
  }
  return out;
}

function adx(bars: {high:number;low:number;close:number}[], period = 14): number[] {
  const len = bars.length;
  const out: number[] = new Array(len).fill(NaN);
  if (len < period * 2) return out;
  const pDM: number[] = [0], nDM: number[] = [0], tr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < len; i++) {
    const up = bars[i].high - bars[i-1].high;
    const dn = bars[i-1].low - bars[i].low;
    pDM.push(up > dn && up > 0 ? up : 0);
    nDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i-1].close), Math.abs(bars[i].low - bars[i-1].close)));
  }
  const smooth = (arr: number[]) => {
    const s: number[] = new Array(len).fill(NaN);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    s[period - 1] = sum;
    for (let i = period; i < len; i++) s[i] = s[i-1] - s[i-1]/period + arr[i];
    return s;
  };
  const sTR = smooth(tr), sPDM = smooth(pDM), sNDM = smooth(nDM);
  const dx: number[] = new Array(len).fill(NaN);
  for (let i = period - 1; i < len; i++) {
    if (!sTR[i]) continue;
    const pDI = 100 * sPDM[i] / sTR[i];
    const nDI = 100 * sNDM[i] / sTR[i];
    const s = pDI + nDI;
    dx[i] = s === 0 ? 0 : 100 * Math.abs(pDI - nDI) / s;
  }
  // ADX = smoothed DX
  let sum = 0, count = 0;
  for (let i = period - 1; i < period * 2 - 1 && i < len; i++) {
    if (!isNaN(dx[i])) { sum += dx[i]; count++; }
  }
  if (count === 0) return out;
  out[period * 2 - 2] = sum / count;
  for (let i = period * 2 - 1; i < len; i++) {
    out[i] = (out[i-1] * (period - 1) + dx[i]) / period;
  }
  return out;
}

function trendDir(close: number, e20: number, e50: number, e200: number): string {
  if (!e20 || !e50 || !e200) return "flat";
  if (close > e20 && e20 > e50 && e50 > e200) return "up";
  if (close < e20 && e20 < e50 && e50 < e200) return "down";
  return "flat";
}
function bucketAdx(v: number): string {
  if (isNaN(v)) return "na";
  if (v < 15) return "lt15";
  if (v < 20) return "15-20";
  if (v < 25) return "20-25";
  if (v < 35) return "25-35";
  return "gt35";
}
function bucketRsi(v: number): string {
  if (isNaN(v)) return "na";
  if (v < 30) return "lt30";
  if (v < 45) return "30-45";
  if (v < 55) return "45-55";
  if (v < 70) return "55-70";
  return "gt70";
}
function bucketDist(price: number, e200: number, atrVal: number): string {
  if (!e200 || !atrVal) return "na";
  const d = (price - e200) / atrVal;
  if (d < -2) return "lt-2";
  if (d < -1) return "-2/-1";
  if (d < -0.3) return "-1/-0.3";
  if (d < 0.3) return "near";
  if (d < 1) return "0.3/1";
  if (d < 2) return "1/2";
  return "gt2";
}
function sessionOf(d: Date): string {
  const h = d.getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 16) return "overlap";
  if (h >= 16 && h < 21) return "ny";
  return "late";
}
function rangePos(close: number, high: number, low: number): string {
  if (high === low) return "mid";
  const p = (close - low) / (high - low);
  if (p < 0.2) return "0-20";
  if (p < 0.4) return "20-40";
  if (p < 0.6) return "40-60";
  if (p < 0.8) return "60-80";
  return "80-100";
}

// Aggregate H1 bars up to a certain index into higher timeframe candles for trend eval
function trendFromH1(bars: {open:number;high:number;low:number;close:number}[], upto: number, hoursPer: number): string {
  // Build synthetic HTF closes ending at `upto`
  const closes: number[] = [];
  for (let i = upto - hoursPer * 250; i <= upto; i += hoursPer) {
    if (i < 0) continue;
    closes.push(bars[i].close);
  }
  if (closes.length < 200) return "flat";
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const last = closes.length - 1;
  return trendDir(closes[last], e20[last], e50[last], e200[last]);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const pairs: string[] = body.pairs?.length ? body.pairs : SYMBOLS;
  const strideHours: number = body.stride ?? 4; // build snapshot every N hours to keep patterns diverse
  const results: any[] = [];

  for (const symbol of pairs) {
    // Load all H1 bars ordered ascending
    const { data: rows, error } = await supabase
      .from("forex_ohlcv")
      .select("bar_timestamp, open, high, low, close")
      .eq("symbol", symbol)
      .eq("timeframe", "H1")
      .order("bar_timestamp", { ascending: true })
      .limit(20000);
    if (error) { results.push({ symbol, error: error.message }); continue; }
    if (!rows || rows.length < 300) { results.push({ symbol, skipped: "too_few_bars", have: rows?.length ?? 0 }); continue; }

    const bars = rows.map((r: any) => ({
      t: new Date(r.bar_timestamp),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    }));
    const closes = bars.map(b => b.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const ema200 = ema(closes, 200);
    const rsi14 = rsi(closes, 14);
    const adx14 = adx(bars, 14);
    const atr14 = atr(bars, 14);
    const pip = pipSize(symbol);

    // Load existing snapshot timestamps for this symbol to avoid dupes
    const { data: existing } = await supabase
      .from("market_snapshots")
      .select("snapshot_at")
      .eq("symbol", symbol);
    const seen = new Set((existing ?? []).map((r: any) => new Date(r.snapshot_at).toISOString()));

    const snapshotsToInsert: any[] = [];
    const outcomesQueue: { snapshot_at: string; idx: number }[] = [];

    for (let i = 250; i < bars.length - 24; i += strideHours) {
      const iso = bars[i].t.toISOString();
      if (seen.has(iso)) continue;
      const price = bars[i].close;
      const atrVal = atr14[i];
      if (!atrVal || isNaN(atrVal)) continue;

      // H1 trend
      const trend_h1 = trendDir(price, ema20[i], ema50[i], ema200[i]);
      const trend_h4 = trendFromH1(bars, i, 4);
      const trend_d1 = trendFromH1(bars, i, 24);
      const trend_m15 = trend_h1; // proxy — we don't have M15 aligned here
      const adx_h1_bucket = bucketAdx(adx14[i]);
      const rsi_h1_bucket = bucketRsi(rsi14[i]);
      const dist_ema200_atr_bucket = bucketDist(price, ema200[i], atrVal);
      // 24h range position
      const lookback = 24;
      let hi = -Infinity, lo = Infinity;
      for (let k = Math.max(0, i - lookback); k <= i; k++) {
        if (bars[k].high > hi) hi = bars[k].high;
        if (bars[k].low < lo) lo = bars[k].low;
      }
      const range_pos_bucket = rangePos(price, hi, lo);
      const session = sessionOf(bars[i].t);
      const dow = bars[i].t.getUTCDay();

      const pattern_key = [
        trend_d1, trend_h4, trend_h1,
        adx_h1_bucket, rsi_h1_bucket, dist_ema200_atr_bucket, range_pos_bucket, session,
      ].join("|");

      snapshotsToInsert.push({
        symbol, snapshot_at: iso, price, atr_h1: atrVal,
        trend_d1, trend_h4, trend_h1, trend_m15,
        adx_h1_bucket, adx_h4_bucket: null,
        rsi_h1_bucket, rsi_h4_bucket: null,
        dist_ema200_atr_bucket, range_pos_bucket,
        session, dow, cot_bias: null, news_sentiment_bucket: null,
        pattern_key,
      });
      outcomesQueue.push({ snapshot_at: iso, idx: i });
    }

    // Insert snapshots in batches
    let inserted = 0;
    for (let b = 0; b < snapshotsToInsert.length; b += 500) {
      const batch = snapshotsToInsert.slice(b, b + 500);
      const { error: e } = await supabase.from("market_snapshots").insert(batch);
      if (!e) inserted += batch.length;
      else console.error("snap insert err", e.message);
    }

    // Fetch inserted ids by snapshot_at
    const isoList = outcomesQueue.map(o => o.snapshot_at);
    const idMap = new Map<string, number>();
    for (let b = 0; b < isoList.length; b += 500) {
      const chunk = isoList.slice(b, b + 500);
      const { data: idRows } = await supabase
        .from("market_snapshots")
        .select("id, snapshot_at")
        .eq("symbol", symbol)
        .in("snapshot_at", chunk);
      (idRows ?? []).forEach((r: any) => idMap.set(new Date(r.snapshot_at).toISOString(), r.id));
    }

    // Compute outcomes: look forward 24 H1 bars
    const outcomes: any[] = [];
    for (const o of outcomesQueue) {
      const id = idMap.get(o.snapshot_at);
      if (!id) continue;
      const startPrice = bars[o.idx].close;
      const atrVal = atr14[o.idx];
      let hi = -Infinity, lo = Infinity;
      for (let k = o.idx + 1; k <= Math.min(bars.length - 1, o.idx + 24); k++) {
        if (bars[k].high > hi) hi = bars[k].high;
        if (bars[k].low < lo) lo = bars[k].low;
      }
      const endIdx = Math.min(bars.length - 1, o.idx + 24);
      const endPrice = bars[endIdx].close;
      const move = (endPrice - startPrice) / pip;
      const mfe = (hi - startPrice) / pip;
      const mae = (startPrice - lo) / pip;
      let dir = "flat";
      const threshold = (atrVal / pip) * 0.3;
      if (move > threshold) dir = "up";
      else if (move < -threshold) dir = "down";
      outcomes.push({
        snapshot_id: id, horizon_hours: 24,
        direction_24h: dir, move_pips: move,
        mfe_pips: mfe, mae_pips: mae,
        mfe_atr: atrVal ? (hi - startPrice) / atrVal : null,
        mae_atr: atrVal ? (startPrice - lo) / atrVal : null,
      });
    }
    let outInserted = 0;
    for (let b = 0; b < outcomes.length; b += 500) {
      const batch = outcomes.slice(b, b + 500);
      const { error: e } = await supabase.from("snapshot_outcomes").upsert(batch, { onConflict: "snapshot_id" });
      if (!e) outInserted += batch.length;
      else console.error("outcome insert err", e.message);
    }

    results.push({ symbol, bars: bars.length, snapshots_new: inserted, outcomes: outInserted });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
