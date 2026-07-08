import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supaUser.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { pair, side, entry, sl, tp, risk_pct, lot: lotOverride, source_type, source_ref, snapshot } = body ?? {};

    if (!pair || !side || !isFinite(entry) || !isFinite(sl) || !isFinite(tp)) {
      return new Response(JSON.stringify({ error: "Invalid trade parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (side !== "LONG" && side !== "SHORT") {
      return new Response(JSON.stringify({ error: "side must be LONG or SHORT" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Ensure demo account exists
    let { data: account } = await admin
      .from("demo_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account) {
      const { data: created, error: createErr } = await admin
        .from("demo_accounts")
        .insert({ user_id: user.id, balance: 1000, starting_balance: 1000, currency: "USD" })
        .select()
        .single();
      if (createErr) throw createErr;
      account = created;
    }

    const balance = Number(account.balance);
    const pipSize = pair.includes("JPY") ? 0.01 : 0.0001;
    const pipValuePerLot = 10; // simplified for *USD pairs
    const slDistancePips = Math.abs(Number(entry) - Number(sl)) / pipSize;
    if (slDistancePips <= 0) {
      return new Response(JSON.stringify({ error: "SL must differ from entry" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lot: number;
    let riskUsd: number;
    if (isFinite(lotOverride) && lotOverride > 0) {
      lot = Math.max(0.01, Number(lotOverride));
      riskUsd = lot * slDistancePips * pipValuePerLot;
    } else {
      const riskPct = Math.min(5, Math.max(0.1, Number(risk_pct) || 1));
      riskUsd = balance * (riskPct / 100);
      lot = riskUsd / (slDistancePips * pipValuePerLot);
      lot = Math.max(0.01, Math.round(lot * 100) / 100);
      riskUsd = lot * slDistancePips * pipValuePerLot;
    }

    // Prevent duplicate open trade from the same source
    if (source_type && source_ref) {
      const { data: dup } = await admin
        .from("demo_trades")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "OPEN")
        .eq("source_type", source_type)
        .eq("source_ref", source_ref)
        .maybeSingle();
      if (dup) {
        return new Response(JSON.stringify({ error: "Ця угода вже відкрита" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: trade, error: insErr } = await admin
      .from("demo_trades")
      .insert({
        user_id: user.id,
        pair,
        side,
        entry: Number(entry),
        sl: Number(sl),
        tp: Number(tp),
        lot,
        risk_usd: riskUsd,
        source_type: source_type ?? null,
        source_ref: source_ref ?? null,
        snapshot: snapshot ?? null,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, trade }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("open-demo-trade error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
