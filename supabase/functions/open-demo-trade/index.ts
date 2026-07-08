import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OrderType = "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";

const orderTypes = new Set<OrderType>(["buy_limit", "sell_limit", "buy_stop", "sell_stop"]);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseOrderType = (raw: unknown, sourceRef: unknown, side: "LONG" | "SHORT"): OrderType => {
  if (typeof raw === "string" && orderTypes.has(raw as OrderType)) return raw as OrderType;

  if (typeof sourceRef === "string") {
    const maybeType = sourceRef.split(":")[1];
    if (orderTypes.has(maybeType as OrderType)) return maybeType as OrderType;
  }

  return side === "LONG" ? "buy_limit" : "sell_limit";
};

const hasValidLevels = (side: "LONG" | "SHORT", entry: number, sl: number, tp: number) =>
  side === "LONG" ? sl < entry && entry < tp : tp < entry && entry < sl;

const getInitialDemoState = (
  orderType: OrderType,
  live: number,
  entry: number,
  sl: number,
  tp: number,
): "PENDING" | "ACTIVE" | "STALE" => {
  switch (orderType) {
    case "buy_limit":
      if (live > entry) return "PENDING";
      if (live <= sl || live >= tp) return "STALE";
      return "ACTIVE";
    case "buy_stop":
      if (live < entry) return "PENDING";
      if (live <= sl || live >= tp) return "STALE";
      return "ACTIVE";
    case "sell_limit":
      if (live < entry) return "PENDING";
      if (live >= sl || live <= tp) return "STALE";
      return "ACTIVE";
    case "sell_stop":
      if (live > entry) return "PENDING";
      if (live >= sl || live <= tp) return "STALE";
      return "ACTIVE";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supaUser.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { pair, side, entry, sl, tp, risk_pct, lot: lotOverride, source_type, source_ref, snapshot, order_type } = body ?? {};

    if (!pair || !side || !isFinite(entry) || !isFinite(sl) || !isFinite(tp)) {
      return jsonResponse({ error: "Invalid trade parameters" }, 400);
    }
    if (side !== "LONG" && side !== "SHORT") {
      return jsonResponse({ error: "side must be LONG or SHORT" }, 400);
    }

    const entryNum = Number(entry);
    const slNum = Number(sl);
    const tpNum = Number(tp);
    if (!hasValidLevels(side, entryNum, slNum, tpNum)) {
      return jsonResponse({ error: "Некоректні рівні сигналу" }, 400);
    }

    const orderType = parseOrderType(order_type, source_ref, side);

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

    // Fetch live price to decide whether the signal is already in-market or
    // should wait as a pending demo session. The trade keeps the clicked signal
    // entry/SL/TP levels, so evaluation happens against the exact levels shown.
    const { data: lp } = await admin.rpc("get_latest_forex_price", { p_symbol: pair });
    const livePrice = lp && lp[0] ? Number(lp[0].price) : NaN;
    if (!isFinite(livePrice)) {
      return jsonResponse({ error: "Немає котирування для " + pair }, 400);
    }

    const demoState = getInitialDemoState(orderType, livePrice, entryNum, slNum, tpNum);
    if (demoState === "STALE") {
      return jsonResponse({
        ok: false,
        reason: "stale_signal",
        error: "Сигнал уже відпрацював рівні SL/TP. Дочекайтесь нового.",
      });
    }

    const actualEntry = entryNum;
    const slDistancePips = Math.abs(actualEntry - slNum) / pipSize;
    if (slDistancePips <= 0) {
      return jsonResponse({ error: "SL must differ from entry" }, 400);
    }

    const isLong = side === "LONG";

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
        return jsonResponse({ error: "Ця демо-сесія вже відкрита" }, 409);
      }
    }

    const { data: trade, error: insErr } = await admin
      .from("demo_trades")
      .insert({
        user_id: user.id,
        pair,
        side,
        entry: actualEntry,
        sl: slNum,
        tp: tpNum,
        lot,
        risk_usd: riskUsd,
        source_type: source_type ?? null,
        source_ref: source_ref ?? null,
        snapshot: {
          ...(snapshot ?? {}),
          order_type: orderType,
          demo_state: demoState,
          signal_entry: entryNum,
          live_price_at_open: livePrice,
        },
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return jsonResponse({ ok: true, trade, demo_state: demoState });
  } catch (e: any) {
    console.error("open-demo-trade error:", e);
    return jsonResponse({ error: e?.message ?? "Unknown" }, 500);
  }
});
