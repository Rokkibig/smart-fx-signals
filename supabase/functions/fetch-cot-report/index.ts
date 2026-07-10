import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CFTC contract-market names → currency code
const CONTRACT_MAP: Record<string, string> = {
  "EURO FX": "EUR",
  "BRITISH POUND": "GBP",
  "BRITISH POUND STERLING": "GBP",
  "JAPANESE YEN": "JPY",
  "SWISS FRANC": "CHF",
  "AUSTRALIAN DOLLAR": "AUD",
  "NEW ZEALAND DOLLAR": "NZD",
  "CANADIAN DOLLAR": "CAD",
  "U.S. DOLLAR INDEX": "USD",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // CFTC public data — Legacy Futures Only (Socrata JSON)
    // Filter to FX-related contracts, latest reports
    const wanted = Object.keys(CONTRACT_MAP)
      .map((n) => `commodity_name='${n.replace(/'/g, "''")}'`)
      .join(" OR ");
    const url =
      `https://publicreporting.cftc.gov/resource/6dca-aqww.json` +
      `?$where=(${wanted})&$order=report_date_as_yyyy_mm_dd DESC&$limit=200`;

    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`CFTC ${r.status}`);
    const rows: any[] = await r.json();

    let saved = 0;
    // pick latest 2 reports per currency (for change_wow)
    const byCurrency = new Map<string, any[]>();
    for (const row of rows) {
      const currency = CONTRACT_MAP[String(row.commodity_name ?? "").toUpperCase()];
      if (!currency) continue;
      const arr = byCurrency.get(currency) ?? [];
      arr.push(row);
      byCurrency.set(currency, arr);
    }

    for (const [currency, arr] of byCurrency) {
      // sort desc by date
      arr.sort((a, b) => String(b.report_date_as_yyyy_mm_dd).localeCompare(String(a.report_date_as_yyyy_mm_dd)));
      const latest = arr[0];
      const prev = arr[1];
      if (!latest) continue;

      const longs = Number(latest.noncomm_positions_long_all ?? 0);
      const shorts = Number(latest.noncomm_positions_short_all ?? 0);
      const net = longs - shorts;

      const prevNet = prev
        ? Number(prev.noncomm_positions_long_all ?? 0) - Number(prev.noncomm_positions_short_all ?? 0)
        : null;
      const changeWow = prevNet != null ? net - prevNet : null;

      const reportDate = String(latest.report_date_as_yyyy_mm_dd).slice(0, 10);

      const { error } = await supabase.from("cot_positions").upsert({
        currency,
        report_date: reportDate,
        non_commercial_long: longs,
        non_commercial_short: shorts,
        net_position: net,
        change_wow: changeWow,
        open_interest: Number(latest.open_interest_all ?? 0),
        raw: latest,
      }, { onConflict: "currency,report_date" });

      if (!error) saved++;
    }

    return new Response(JSON.stringify({ ok: true, saved, currencies: [...byCurrency.keys()] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fetch-cot-report error:", e);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
