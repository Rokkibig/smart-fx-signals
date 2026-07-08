import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cron: closes user demo trades hit by TP/SL/expiry and updates their balance.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { data: open, error } = await supa
      .from("demo_trades")
      .select("*")
      .eq("status", "OPEN");
    if (error) throw error;
    if (!open || open.length === 0) {
      return new Response(JSON.stringify({ ok: true, evaluated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pairs = [...new Set(open.map((t: any) => t.pair))];
    const priceMap: Record<string, number> = {};
    for (const p of pairs) {
      const { data: lp } = await supa.rpc("get_latest_forex_price", { p_symbol: p });
      if (lp && lp[0]) priceMap[p] = Number(lp[0].price);
    }

    const now = new Date();
    let updated = 0;

    for (const t of open as any[]) {
      const live = priceMap[t.pair];
      if (!isFinite(live)) continue;

      const entry = Number(t.entry);
      const sl = Number(t.sl);
      const tp = Number(t.tp);
      const lot = Number(t.lot);
      const isLong = t.side === "LONG";
      const pipSize = String(t.pair).includes("JPY") ? 0.01 : 0.0001;
      const pipValuePerLot = 10;
      const expired = new Date(t.expires_at) <= now;

      let status: "TP" | "SL" | "EXPIRED" | null = null;
      let exit_price = live;

      if (isLong) {
        if (live >= tp) { status = "TP"; exit_price = tp; }
        else if (live <= sl) { status = "SL"; exit_price = sl; }
      } else {
        if (live <= tp) { status = "TP"; exit_price = tp; }
        else if (live >= sl) { status = "SL"; exit_price = sl; }
      }
      if (!status && expired) { status = "EXPIRED"; exit_price = live; }
      if (!status) continue;

      const priceMoveInPips = (isLong ? exit_price - entry : entry - exit_price) / pipSize;
      const realized = priceMoveInPips * pipValuePerLot * lot;

      const { error: upErr } = await supa
        .from("demo_trades")
        .update({
          status,
          exit_price,
          realized_pnl: realized,
          closed_at: now.toISOString(),
        })
        .eq("id", t.id);
      if (upErr) { console.error(upErr); continue; }

      // Update balance
      const { data: acc } = await supa
        .from("demo_accounts")
        .select("balance")
        .eq("user_id", t.user_id)
        .maybeSingle();
      if (acc) {
        const newBal = Number(acc.balance) + realized;
        await supa
          .from("demo_accounts")
          .update({ balance: newBal })
          .eq("user_id", t.user_id);
      }
      updated++;
    }

    return new Response(JSON.stringify({ ok: true, evaluated: updated, checked: open.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("evaluate-demo-trades error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
