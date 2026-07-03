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
 * Оцінює точність напрямку і руху: 0-100.
 *  - +60 якщо напрямок вгаданий
 *  - +40 * (min(actualPips, expectedPips) / expectedPips) якщо був рух у правильний бік
 *  - -20 якщо direction = neutral але рух > 1.5 * ATR
 */
function scoreAccuracy(
  predDir: string,
  actualDir: string,
  actualPips: number,
  expectedPips: number | null
): number {
  let s = 0;
  if (predDir === actualDir) s += 60;
  if (predDir === actualDir && predDir !== "neutral" && expectedPips && expectedPips > 0) {
    const ratio = Math.min(Math.abs(actualPips), expectedPips) / expectedPips;
    s += 40 * ratio;
  }
  if (predDir === "neutral" && Math.abs(actualPips) > 40) s -= 20;
  return Math.max(0, Math.min(100, Math.round(s)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Беремо прогнози старші ніж 24 год та ще не оцінені
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pending, error: pErr } = await supabase
      .from("daily_forecasts")
      .select("*")
      .is("evaluated_at", null)
      .lte("created_at", cutoff)
      .limit(50);

    if (pErr) throw pErr;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ ok: true, evaluated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let evaluated = 0;
    const statsUpdates: Record<string, any> = {};

    for (const f of pending) {
      // Поточна ціна (кінець 24-год періоду)
      const { data: latest } = await supabase
        .from("forex_prices")
        .select("price")
        .eq("symbol", f.symbol)
        .order("price_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) continue;

      const priceNow = Number(latest.price);
      const priceThen = Number(f.price_at_forecast);
      const pip = pipSize(f.symbol);
      const moveInPips = ((priceNow - priceThen) / pip);

      let actualDir: "up" | "down" | "neutral" = "neutral";
      if (moveInPips > 15) actualDir = "up";
      else if (moveInPips < -15) actualDir = "down";

      // Досягнення target/stop (спрощено — по поточній ціні)
      const hitTarget = f.target_price != null && (
        (f.direction === "up" && priceNow >= Number(f.target_price)) ||
        (f.direction === "down" && priceNow <= Number(f.target_price))
      );
      const hitStop = f.stop_price != null && (
        (f.direction === "up" && priceNow <= Number(f.stop_price)) ||
        (f.direction === "down" && priceNow >= Number(f.stop_price))
      );

      const score = scoreAccuracy(f.direction, actualDir, moveInPips, f.expected_move_pips);
      const notes = f.direction === actualDir
        ? "Напрямок вгаданий"
        : `Помилка: прогноз=${f.direction}, факт=${actualDir}, рух ${moveInPips.toFixed(1)} п.`;

      await supabase
        .from("daily_forecasts")
        .update({
          evaluated_at: new Date().toISOString(),
          actual_direction: actualDir,
          actual_move_pips: Number(moveInPips.toFixed(2)),
          hit_target: hitTarget,
          hit_stop: hitStop,
          accuracy_score: score,
          evaluation_notes: notes,
        })
        .eq("id", f.id);

      // Копимо оновлення статистики
      const s = statsUpdates[f.symbol] ??= {
        total: 0, correct: 0, hitT: 0, hitS: 0, accSum: 0, probSum: 0, mistakes: [] as any[],
      };
      s.total += 1;
      if (f.direction === actualDir) s.correct += 1;
      if (hitTarget) s.hitT += 1;
      if (hitStop) s.hitS += 1;
      s.accSum += score;
      s.probSum += Number(f.probability);
      if (f.direction !== actualDir) {
        s.mistakes.push({
          date: f.forecast_date,
          predicted: f.direction,
          actual: actualDir,
          probability: f.probability,
          move_pips: Number(moveInPips.toFixed(1)),
          reasoning: f.reasoning?.slice(0, 200),
        });
      }
      evaluated += 1;
    }

    // Оновлюємо forecast_stats (акумулятивно)
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

      const mistakes = [
        ...s.mistakes,
        ...((existing?.recent_mistakes as any[]) ?? []),
      ].slice(0, 10);

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
