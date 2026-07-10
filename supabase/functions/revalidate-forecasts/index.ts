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
 * Re-anchor активних прогнозів:
 *  1) Якщо TP або SL вже досягнутий live-ціною — status=HIT_TARGET / HIT_STOP.
 *  2) Якщо ціна пішла проти прогнозу і пробила первинний stop_price
 *     (без досягнення TP) — status=INVALIDATED.
 *  3) Якщо |live - current_entry| > 0.5 × ATR(D1) — зсуваємо entry на live,
 *     перераховуємо TP = live ± max(1.5×ATR_H1, expected_move_pips×pip)
 *     та SL = live ± 1.0×ATR_D1. Direction зберігається.
 *  4) Не змінюємо частіше ніж 1 раз на 30 хв.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { data: active } = await supabase
      .from("daily_forecasts")
      .select("*")
      .eq("status", "ACTIVE")
      .is("evaluated_at", null);

    if (!active || active.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    let hit = 0, invalidated = 0, adjusted = 0, skipped = 0;

    for (const f of active) {
      const pip = pipSize(f.symbol);
      const dir = f.direction as "up" | "down" | "neutral";

      // live price
      const { data: priceRow } = await supabase
        .from("forex_prices")
        .select("price, price_timestamp")
        .eq("symbol", f.symbol)
        .order("price_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!priceRow) { skipped++; continue; }
      const live = Number(priceRow.price);

      const entry = Number(f.current_entry ?? f.price_at_forecast);
      const target = f.current_target != null ? Number(f.current_target) : null;
      const stop = f.current_stop != null ? Number(f.current_stop) : null;
      const origStop = f.stop_price != null ? Number(f.stop_price) : null;

      // 1) TP/SL торкнувся live-ціною — одразу записуємо score, щоб % якості оновився в UI.
      if (dir === "up") {
        if (target != null && live >= target) {
          await supabase.from("daily_forecasts").update({
            status: "HIT_TARGET",
            evaluated_at: new Date().toISOString(),
            actual_direction: "up",
            actual_move_pips: Number(((live - entry) / pip).toFixed(2)),
            hit_target: true,
            hit_stop: false,
            accuracy_score: 90,
            evaluation_notes: `TP досягнутий live-ціною ${live}`,
          }).eq("id", f.id);
          hit++; continue;
        }
        if (stop != null && live <= stop) {
          await supabase.from("daily_forecasts").update({
            status: "HIT_STOP",
            evaluated_at: new Date().toISOString(),
            actual_direction: "down",
            actual_move_pips: Number(((entry - live) / pip).toFixed(2)),
            hit_target: false,
            hit_stop: true,
            accuracy_score: 5,
            evaluation_notes: `SL спрацював live-ціною ${live}`,
          }).eq("id", f.id);
          hit++; continue;
        }
      } else if (dir === "down") {
        if (target != null && live <= target) {
          await supabase.from("daily_forecasts").update({
            status: "HIT_TARGET",
            evaluated_at: new Date().toISOString(),
            actual_direction: "down",
            actual_move_pips: Number(((entry - live) / pip).toFixed(2)),
            hit_target: true,
            hit_stop: false,
            accuracy_score: 90,
            evaluation_notes: `TP досягнутий live-ціною ${live}`,
          }).eq("id", f.id);
          hit++; continue;
        }
        if (stop != null && live >= stop) {
          await supabase.from("daily_forecasts").update({
            status: "HIT_STOP",
            evaluated_at: new Date().toISOString(),
            actual_direction: "up",
            actual_move_pips: Number(((live - entry) / pip).toFixed(2)),
            hit_target: false,
            hit_stop: true,
            accuracy_score: 5,
            evaluation_notes: `SL спрацював live-ціною ${live}`,
          }).eq("id", f.id);
          hit++; continue;
        }
      }

      // 2) Первинний SL пробитий — invalidate (щоб не змінювати SL нескінченно)
      if (origStop != null && dir !== "neutral") {
        if ((dir === "up" && live <= origStop) || (dir === "down" && live >= origStop)) {
          await supabase.from("daily_forecasts").update({
            status: "INVALIDATED",
            invalidation_reason: `Ціна ${live} пробила первинний SL ${origStop}`,
          }).eq("id", f.id);
          invalidated++; continue;
        }
      }

      // neutral не re-anchor'имо
      if (dir === "neutral") { skipped++; continue; }

      // 3) rate-limit: не частіше 30 хв
      if (f.last_revalidated_at && now - new Date(f.last_revalidated_at).getTime() < 30 * 60 * 1000) {
        skipped++; continue;
      }

      // ATR D1 та H1
      const { data: feats } = await supabase
        .from("forex_features")
        .select("timeframe, atr_14")
        .eq("symbol", f.symbol)
        .in("timeframe", ["D1", "H1"])
        .order("calculated_at", { ascending: false })
        .limit(4);
      const atrD1 = Number(feats?.find((x: any) => x.timeframe === "D1")?.atr_14 ?? 0);
      const atrH1 = Number(feats?.find((x: any) => x.timeframe === "H1")?.atr_14 ?? 0);
      if (!atrD1 || !atrH1) { skipped++; continue; }

      const drift = Math.abs(live - entry);
      if (drift < 0.5 * atrD1) { skipped++; continue; }

      // 4) Re-anchor
      const expectedMove = f.expected_move_pips != null
        ? Number(f.expected_move_pips) * pip
        : 1.5 * atrH1;
      const tpDist = Math.max(1.5 * atrH1, expectedMove);
      const slDist = Math.max(1.0 * atrD1, 1.5 * atrH1);

      const newEntry = live;
      const newTarget = dir === "up" ? live + tpDist : live - tpDist;
      const newStop   = dir === "up" ? live - slDist : live + slDist;

      await supabase.from("forecast_adjustments").insert({
        forecast_id: f.id,
        symbol: f.symbol,
        reason: `Дрейф ${(drift/pip).toFixed(1)}п. > 0.5×ATR_D1 (${(0.5*atrD1/pip).toFixed(1)}п.)`,
        old_entry: entry, new_entry: newEntry,
        old_target: target, new_target: newTarget,
        old_stop: stop, new_stop: newStop,
        live_price: live,
        atr_used: atrD1,
      });

      await supabase.from("daily_forecasts").update({
        current_entry: newEntry,
        current_target: newTarget,
        current_stop: newStop,
        adjustments_count: (f.adjustments_count ?? 0) + 1,
        last_revalidated_at: new Date().toISOString(),
      }).eq("id", f.id);

      adjusted++;
    }

    return new Response(JSON.stringify({ ok: true, hit, invalidated, adjusted, skipped, total: active.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("revalidate-forecasts error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
