import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Оцінює відкриті сигнали в signal_outcomes:
//  - тягне поточну live_price по кожній парі
//  - якщо ціна торкнулась TP → status=TP, realized_pnl = tp-entry (LONG) / entry-tp (SHORT)
//  - якщо торкнулась SL → status=SL, realized_pnl = -(risk)
//  - якщо now > expires_at → status=EXPIRED, realized_pnl = current-entry (direction-aware)
//  - surprise_ratio = |realized - expected| / |expected|
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { data: open, error } = await supa
      .from("signal_outcomes")
      .select("*")
      .eq("status", "OPEN");
    if (error) throw error;

    if (!open || open.length === 0) {
      return new Response(JSON.stringify({ success: true, evaluated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Групуємо по парах щоб не запитувати ціну повторно
    const pairs = [...new Set(open.map((o: any) => o.pair))];
    const priceMap: Record<string, number> = {};
    for (const p of pairs) {
      const { data: lp } = await supa.rpc("get_latest_forex_price", { p_symbol: p });
      if (lp && lp[0]) priceMap[p] = Number(lp[0].price);
    }

    const now = new Date();
    let updated = 0;

    for (const o of open as any[]) {
      const live = priceMap[o.pair];
      if (!isFinite(live)) continue;

      const entry = Number(o.entry);
      const sl = Number(o.sl);
      const tp = Number(o.tp);
      const isLong = o.side === "LONG";
      const expected = Number(o.expected_pnl) || Math.abs(tp - entry);
      const expired = new Date(o.expires_at) <= now;

      let status: "TP" | "SL" | "EXPIRED" | null = null;
      let exit_price = live;
      let realized = 0;

      // Умови торкання (використовуємо live як proxy — точніше було б OHLC хай/лоу за період)
      if (isLong) {
        if (live >= tp) { status = "TP"; exit_price = tp; realized = tp - entry; }
        else if (live <= sl) { status = "SL"; exit_price = sl; realized = sl - entry; }
      } else {
        if (live <= tp) { status = "TP"; exit_price = tp; realized = entry - tp; }
        else if (live >= sl) { status = "SL"; exit_price = sl; realized = entry - sl; }
      }

      if (!status && expired) {
        status = "EXPIRED";
        exit_price = live;
        realized = isLong ? live - entry : entry - live;
      }

      if (!status) continue;

      const surprise = expected > 0 ? Math.abs(Math.abs(realized) - expected) / expected : 0;

      const { error: upErr } = await supa
        .from("signal_outcomes")
        .update({
          status,
          exit_price,
          realized_pnl: realized,
          surprise_ratio: surprise,
          closed_at: now.toISOString(),
        })
        .eq("id", o.id);

      if (upErr) console.error("update err:", upErr);
      else updated++;
    }

    return new Response(JSON.stringify({ success: true, evaluated: updated, checked: open.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("evaluate-signal-outcomes error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
