// Statistical forecast — no AI fantasies. Finds historically similar snapshots
// via pattern_key and computes direction/probability/TP/SL from real outcomes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","NZD/USD","USD/CAD"];
const MIN_MATCHES = 30;
const MIN_EDGE_PCT = 55;

function pipSize(s: string) { return s.includes("JPY") ? 0.01 : 0.0001; }
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
}
function bucketAdx(v: number) { if (isNaN(v)) return "na"; if (v<15) return "lt15"; if (v<20) return "15-20"; if (v<25) return "20-25"; if (v<35) return "25-35"; return "gt35"; }
function bucketRsi(v: number) { if (isNaN(v)) return "na"; if (v<30) return "lt30"; if (v<45) return "30-45"; if (v<55) return "45-55"; if (v<70) return "55-70"; return "gt70"; }
function bucketDist(price: number, e200: number, atrVal: number) {
  if (!e200 || !atrVal) return "na";
  const d = (price - e200) / atrVal;
  if (d<-2) return "lt-2"; if (d<-1) return "-2/-1"; if (d<-0.3) return "-1/-0.3";
  if (d<0.3) return "near"; if (d<1) return "0.3/1"; if (d<2) return "1/2"; return "gt2";
}
function sessionOf(d: Date) {
  const h = d.getUTCHours();
  if (h<7) return "asia"; if (h<12) return "london"; if (h<16) return "overlap"; if (h<21) return "ny"; return "late";
}
function trendDir(close: number, e20: number, e50: number, e200: number) {
  if (!e20 || !e50 || !e200) return "flat";
  if (close > e20 && e20 > e50 && e50 > e200) return "up";
  if (close < e20 && e20 < e50 && e50 < e200) return "down";
  return "flat";
}
function rangePos(close: number, hi: number, lo: number) {
  if (hi === lo) return "mid";
  const p = (close - lo) / (hi - lo);
  if (p<0.2) return "0-20"; if (p<0.4) return "20-40"; if (p<0.6) return "40-60"; if (p<0.8) return "60-80"; return "80-100";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const pairs: string[] = body.pairs?.length ? body.pairs : SYMBOLS;
  const forecastDate = new Date().toISOString().slice(0, 10);
  const results: any[] = [];

  for (const symbol of pairs) {
    // Current price
    const { data: priceRow } = await supabase
      .from("forex_prices").select("price")
      .eq("symbol", symbol).order("price_timestamp", { ascending: false }).limit(1).maybeSingle();
    if (!priceRow) { results.push({ symbol, skipped: "no_price" }); continue; }
    const price = Number(priceRow.price);
    const pip = pipSize(symbol);

    // Latest features per TF
    const { data: feats } = await supabase
      .from("forex_features")
      .select("timeframe, last_close, ema_20, ema_50, ema_200, adx_14, rsi_14, atr_14")
      .eq("symbol", symbol)
      .order("calculated_at", { ascending: false })
      .limit(8);

    const featBy: Record<string, any> = {};
    (feats ?? []).forEach((f: any) => { if (!featBy[f.timeframe]) featBy[f.timeframe] = f; });

    const h1 = featBy["H1"];
    const h4 = featBy["H4"];
    const d1 = featBy["D1"];
    if (!h1 || !d1) { results.push({ symbol, skipped: "missing_features" }); continue; }

    const atrVal = Number(h1.atr_14);
    const trend_d1 = trendDir(Number(d1.last_close), Number(d1.ema_20), Number(d1.ema_50), Number(d1.ema_200));
    const trend_h4 = h4 ? trendDir(Number(h4.last_close), Number(h4.ema_20), Number(h4.ema_50), Number(h4.ema_200)) : "flat";
    const trend_h1 = trendDir(Number(h1.last_close), Number(h1.ema_20), Number(h1.ema_50), Number(h1.ema_200));
    const adx_h1_bucket = bucketAdx(Number(h1.adx_14));
    const rsi_h1_bucket = bucketRsi(Number(h1.rsi_14));
    const dist_ema200_atr_bucket = bucketDist(price, Number(h1.ema_200), atrVal);

    // Range pos from last 24 H1 bars
    const { data: recent } = await supabase
      .from("forex_ohlcv").select("high, low")
      .eq("symbol", symbol).eq("timeframe", "H1")
      .order("bar_timestamp", { ascending: false }).limit(24);
    let hi = -Infinity, lo = Infinity;
    (recent ?? []).forEach((b: any) => {
      if (Number(b.high) > hi) hi = Number(b.high);
      if (Number(b.low) < lo) lo = Number(b.low);
    });
    const range_pos_bucket = recent?.length ? rangePos(price, hi, lo) : "na";

    const session = sessionOf(new Date());
    const pattern_key = [trend_d1, trend_h4, trend_h1, adx_h1_bucket, rsi_h1_bucket, dist_ema200_atr_bucket, range_pos_bucket, session].join("|");

    // Query similar historical snapshots' outcomes for this symbol
    const { data: matchSnaps } = await supabase
      .from("market_snapshots")
      .select("id")
      .eq("symbol", symbol)
      .eq("pattern_key", pattern_key);
    const ids = (matchSnaps ?? []).map((r: any) => r.id);

    let outcomes: any[] = [];
    let stat_source = "exact_pattern";

    if (ids.length >= MIN_MATCHES) {
      // batched fetch to avoid URL length limits
      for (let b = 0; b < ids.length; b += 500) {
        const { data: outs } = await supabase
          .from("snapshot_outcomes").select("direction_24h, move_pips, mfe_pips, mae_pips")
          .in("snapshot_id", ids.slice(b, b + 500));
        outcomes = outcomes.concat(outs ?? []);
      }
    } else {
      // Fallback: relax to trend triplet + adx
      const relaxedKey = `${trend_d1}|${trend_h4}|${trend_h1}|${adx_h1_bucket}`;
      const { data: relaxSnaps } = await supabase
        .from("market_snapshots")
        .select("id, pattern_key")
        .eq("symbol", symbol);
      const relaxIds = (relaxSnaps ?? []).filter((r: any) => r.pattern_key.startsWith(relaxedKey)).map((r: any) => r.id);
      for (let b = 0; b < relaxIds.length; b += 500) {
        const { data: outs } = await supabase
          .from("snapshot_outcomes").select("direction_24h, move_pips, mfe_pips, mae_pips")
          .in("snapshot_id", relaxIds.slice(b, b + 500));
        outcomes = outcomes.concat(outs ?? []);
      }
      stat_source = "relaxed_pattern";
    }

    const n = outcomes.length;
    if (n < MIN_MATCHES) {
      await supabase.from("daily_forecasts").upsert({
        symbol, forecast_date: forecastDate, forecast_horizon_hours: 24,
        direction: "neutral", probability: 50, price_at_forecast: price,
        status: "INSUFFICIENT_HISTORY", adjustments_count: 0,
        reasoning: `Недостатньо історичних прикладів (${n} < ${MIN_MATCHES}). Без вигаданого прогнозу.`,
        pattern_key, n_matches: n, stat_source, model_version: "stat-v1",
      }, { onConflict: "symbol,forecast_date" });
      results.push({ symbol, status: "INSUFFICIENT_HISTORY", n });
      continue;
    }

    const upCount = outcomes.filter(o => o.direction_24h === "up").length;
    const downCount = outcomes.filter(o => o.direction_24h === "down").length;
    const flatCount = n - upCount - downCount;
    const pUp = (upCount / n) * 100;
    const pDown = (downCount / n) * 100;
    const pFlat = (flatCount / n) * 100;

    const bestSide = pUp >= pDown ? "up" : "down";
    const bestPct = Math.max(pUp, pDown);

    if (bestPct < MIN_EDGE_PCT) {
      await supabase.from("daily_forecasts").upsert({
        symbol, forecast_date: forecastDate, forecast_horizon_hours: 24,
        direction: "neutral", probability: Math.round(bestPct), price_at_forecast: price,
        status: "NO_EDGE", adjustments_count: 0,
        reasoning: `${n} схожих випадків: вгору ${pUp.toFixed(0)}%, вниз ${pDown.toFixed(0)}%, флет ${pFlat.toFixed(0)}%. Немає статистичної переваги (мін ${MIN_EDGE_PCT}%).`,
        pattern_key, n_matches: n, p_up: pUp, p_down: pDown, p_flat: pFlat,
        stat_source, model_version: "stat-v1",
      }, { onConflict: "symbol,forecast_date" });
      results.push({ symbol, status: "NO_EDGE", n, pUp, pDown });
      continue;
    }

    // Winning-side outcomes → medians for TP/SL
    const winning = outcomes.filter(o => o.direction_24h === bestSide);
    const mfePips = winning.map(o => Number(o.mfe_pips));
    const maePips = winning.map(o => Number(o.mae_pips));
    const movePips = winning.map(o => Number(o.move_pips));
    const medMfe = median(mfePips);
    const medMae = median(maePips);
    const medMove = median(movePips);

    // Real TP/SL from historical MFE/MAE
    let targetPrice: number, stopPrice: number;
    if (bestSide === "up") {
      targetPrice = price + medMfe * pip;
      stopPrice   = price - medMae * pip;
    } else {
      targetPrice = price - medMfe * pip;
      stopPrice   = price + medMae * pip;
    }

    const reasoning = `Знайдено ${n} історично схожих випадків (${stat_source === "exact_pattern" ? "точний патерн" : "розширений патерн"}). У ${bestPct.toFixed(0)}% з них ціна рухалась ${bestSide === "up" ? "вгору" : "вниз"}. Медіанний хід у виграшних випадках: ${Math.abs(medMove).toFixed(0)} пунктів, типове просідання: ${medMae.toFixed(0)} пунктів. Прогноз побудований зі статистики, не з припущень AI.`;

    await supabase.from("daily_forecasts").upsert({
      symbol, forecast_date: forecastDate, forecast_horizon_hours: 24,
      direction: bestSide,
      probability: Math.round(bestPct),
      price_at_forecast: price,
      target_price: targetPrice, stop_price: stopPrice,
      current_entry: price, current_target: targetPrice, current_stop: stopPrice,
      status: "ACTIVE", adjustments_count: 0,
      expected_move_pips: Math.abs(medMove),
      reasoning,
      technical_snapshot: { pattern_key, n_matches: n, pUp, pDown, pFlat, medMfe, medMae },
      pattern_key, n_matches: n, p_up: pUp, p_down: pDown, p_flat: pFlat,
      median_move_pips: Math.abs(medMove), median_mae_pips: medMae,
      stat_source, model_version: "stat-v1",
    }, { onConflict: "symbol,forecast_date" });

    results.push({ symbol, direction: bestSide, prob: bestPct, n });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
