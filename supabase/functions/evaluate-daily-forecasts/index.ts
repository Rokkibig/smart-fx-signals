import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pipSize(symbol: string): number {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

/**
 * Оцінка на базі OHLC:
 *  - +70 якщо TP торкнувся раніше SL (напрямок правильний і рух вистачив)
 *  - +25 якщо напрямок вгаданий і рух ≥ 50% expected_move
 *  - -30 якщо SL торкнувся раніше TP
 *  - neutral: +50 якщо |max_move| < neutral_threshold, інакше -20
 */
function scoreOHLC(params: {
  direction: string;
  entry: number;
  target: number | null;
  stop: number | null;
  bars: { high: number; low: number }[];
  expectedPips: number | null;
  pip: number;
  neutralThresholdPips: number;
}): { score: number; hitTarget: boolean; hitStop: boolean; actualDir: string; maxMovePips: number; note: string } {
  const { direction, entry, target, stop, bars, expectedPips, pip, neutralThresholdPips } = params;

  let hitTarget = false;
  let hitStop = false;
  let hitFirst: "target" | "stop" | null = null;

  const maxHigh = bars.reduce((m, b) => Math.max(m, b.high), -Infinity);
  const minLow = bars.reduce((m, b) => Math.min(m, b.low), Infinity);
  const upMovePips = (maxHigh - entry) / pip;
  const downMovePips = (entry - minLow) / pip;
  const maxMovePips = direction === "up" ? upMovePips : direction === "down" ? downMovePips : Math.max(upMovePips, downMovePips);

  for (const b of bars) {
    if (direction === "up") {
      if (target != null && b.high >= target && !hitFirst) { hitTarget = true; hitFirst = "target"; }
      if (stop != null && b.low <= stop && !hitFirst) { hitStop = true; hitFirst = "stop"; }
    } else if (direction === "down") {
      if (target != null && b.low <= target && !hitFirst) { hitTarget = true; hitFirst = "target"; }
      if (stop != null && b.high >= stop && !hitFirst) { hitStop = true; hitFirst = "stop"; }
    }
    if (hitFirst) break;
  }

  let actualDir: "up" | "down" | "neutral" = "neutral";
  if (upMovePips > neutralThresholdPips && upMovePips > downMovePips) actualDir = "up";
  else if (downMovePips > neutralThresholdPips) actualDir = "down";

  let score = 0;
  let note = "";

  if (direction === "neutral") {
    if (Math.max(upMovePips, downMovePips) < neutralThresholdPips * 1.5) {
      score = 60;
      note = `Флет підтверджений (max рух ${Math.max(upMovePips, downMovePips).toFixed(1)}п. < поріг ${(neutralThresholdPips*1.5).toFixed(0)}п.)`;
    } else {
      score = 20;
      note = `Прогноз neutral але був рух ${maxMovePips.toFixed(1)}п.`;
    }
  } else if (hitTarget) {
    score = 90;
    note = `TP досягнутий (рух ${maxMovePips.toFixed(1)}п.)`;
  } else if (hitStop) {
    score = 5;
    note = `SL спрацював (рух проти на ${maxMovePips.toFixed(1)}п.)`;
  } else if (direction === actualDir) {
    const ratio = expectedPips && expectedPips > 0 ? Math.min(maxMovePips / expectedPips, 1) : 0.5;
    score = Math.round(40 + 40 * ratio);
    note = `Напрямок вгаданий, ${(ratio*100).toFixed(0)}% очікуваного руху`;
  } else if (actualDir === "neutral") {
    score = 30;
    note = `Ринок у флеті, TP не досягнутий (max ${maxMovePips.toFixed(1)}п.)`;
  } else {
    score = 10;
    note = `Напрямок протилежний: прогноз=${direction}, факт=${actualDir}`;
  }

  return { score: Math.max(0, Math.min(100, score)), hitTarget, hitStop, actualDir, maxMovePips, note };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pending, error: pErr } = await supabase
      .from("daily_forecasts")
      .select("*")
      .is("evaluated_at", null)
      .in("status", ["ACTIVE", "INVALIDATED"])
      .lte("created_at", cutoff)
      .limit(100);

    if (pErr) throw pErr;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ ok: true, evaluated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let evaluated = 0;
    const statsUpdates: Record<string, any> = {};

    for (const f of pending) {
      const pip = pipSize(f.symbol);
      const entry = Number(f.current_entry ?? f.price_at_forecast);
      const target = f.current_target != null ? Number(f.current_target) : (f.target_price != null ? Number(f.target_price) : null);
      const stop = f.current_stop != null ? Number(f.current_stop) : (f.stop_price != null ? Number(f.stop_price) : null);

      // ATR H1 -> neutral threshold
      const { data: featH1 } = await supabase
        .from("forex_features")
        .select("atr_14")
        .eq("symbol", f.symbol)
        .eq("timeframe", "H1")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const atrH1 = Number(featH1?.atr_14 ?? 0);
      const neutralThresholdPips = atrH1 > 0 ? Math.max(8, (atrH1 / pip) * 0.6) : 15;

      // OHLC H1 за 24 год після створення прогнозу
      const from = new Date(f.created_at).toISOString();
      const to = new Date(new Date(f.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const { data: bars } = await supabase
        .from("forex_ohlcv")
        .select("high, low")
        .eq("symbol", f.symbol)
        .eq("timeframe", "H1")
        .gte("bar_timestamp", from)
        .lte("bar_timestamp", to)
        .order("bar_timestamp", { ascending: true });

      if (!bars || bars.length === 0) {
        // fallback: снапшот live-ціни
        const { data: latest } = await supabase
          .from("forex_prices")
          .select("price")
          .eq("symbol", f.symbol)
          .order("price_timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latest) continue;
        const priceNow = Number(latest.price);
        bars && bars.push({ high: priceNow, low: priceNow });
      }

      const result = scoreOHLC({
        direction: f.direction,
        entry,
        target,
        stop,
        bars: (bars ?? []).map((b: any) => ({ high: Number(b.high), low: Number(b.low) })),
        expectedPips: f.expected_move_pips != null ? Number(f.expected_move_pips) : null,
        pip,
        neutralThresholdPips,
      });

      const newStatus = f.status === "INVALIDATED" ? "INVALIDATED"
        : result.hitTarget ? "HIT_TARGET"
        : result.hitStop ? "HIT_STOP"
        : "EXPIRED";

      await supabase
        .from("daily_forecasts")
        .update({
          evaluated_at: new Date().toISOString(),
          actual_direction: result.actualDir,
          actual_move_pips: Number(result.maxMovePips.toFixed(2)),
          hit_target: result.hitTarget,
          hit_stop: result.hitStop,
          accuracy_score: result.score,
          evaluation_notes: result.note,
          status: newStatus,
        })
        .eq("id", f.id);

      const s = statsUpdates[f.symbol] ??= {
        total: 0, correct: 0, hitT: 0, hitS: 0, accSum: 0, probSum: 0, mistakes: [] as any[],
      };
      s.total += 1;
      if (f.direction === result.actualDir) s.correct += 1;
      if (result.hitTarget) s.hitT += 1;
      if (result.hitStop) s.hitS += 1;
      s.accSum += result.score;
      s.probSum += Number(f.probability);
      if (result.score < 50) {
        s.mistakes.push({
          date: f.forecast_date,
          predicted: f.direction,
          actual: result.actualDir,
          probability: f.probability,
          max_move_pips: Number(result.maxMovePips.toFixed(1)),
          hit_stop: result.hitStop,
          note: result.note,
          reasoning: f.reasoning?.slice(0, 180),
        });
      }
      evaluated += 1;
    }

    for (const [symbol, s] of Object.entries(statsUpdates)) {
      const { data: existing } = await supabase
        .from("forecast_stats")
        .select("*")
        .eq("symbol", symbol)
        .maybeSingle();

      const prevTotal = existing?.total_forecasts ?? 0;
      const newTotal = prevTotal + s.total;
      const newCorrect = (existing?.correct_direction ?? 0) + s.correct;
      const newAcc = ((existing?.avg_accuracy ?? 0) * prevTotal + s.accSum) / Math.max(1, newTotal);
      const newProb = ((existing?.avg_probability ?? 0) * prevTotal + s.probSum) / Math.max(1, newTotal);
      const mistakes = [...s.mistakes, ...((existing?.recent_mistakes as any[]) ?? [])].slice(0, 12);

      await supabase.from("forecast_stats").upsert({
        symbol,
        total_forecasts: newTotal,
        correct_direction: newCorrect,
        hit_target_count: (existing?.hit_target_count ?? 0) + s.hitT,
        hit_stop_count: (existing?.hit_stop_count ?? 0) + s.hitS,
        avg_accuracy: Number(newAcc.toFixed(2)),
        avg_probability: Number(newProb.toFixed(2)),
        recent_mistakes: mistakes,
        last_evaluated_at: new Date().toISOString(),
      }, { onConflict: "symbol" });
    }

    return new Response(JSON.stringify({ ok: true, evaluated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("evaluate-daily-forecasts error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
