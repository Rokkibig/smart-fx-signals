import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Пари, які нас цікавлять, і валюти, які їх рухають
const PAIR_CURRENCIES: Record<string, string[]> = {
  "EUR/USD": ["EUR", "USD"],
  "GBP/USD": ["GBP", "USD"],
  "USD/JPY": ["USD", "JPY"],
  "USD/CHF": ["USD", "CHF"],
  "AUD/USD": ["AUD", "USD"],
  "NZD/USD": ["NZD", "USD"],
  "USD/CAD": ["USD", "CAD"],
};
const WATCHED = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"]);

function symbolsForCurrency(cur: string): string[] {
  return Object.entries(PAIR_CURRENCIES)
    .filter(([, curs]) => curs.includes(cur))
    .map(([sym]) => sym);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "TWELVE_DATA_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const start = new Date();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const url = `https://api.twelvedata.com/economic_calendar?start_date=${startStr}&end_date=${endStr}&apikey=${apiKey}`;
    const r = await fetch(url);
    const data = await r.json();

    if (!data.values && !Array.isArray(data)) {
      return new Response(JSON.stringify({ ok: false, raw: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const events: any[] = data.values ?? data;

    let saved = 0;
    for (const ev of events) {
      const cur = (ev.currency || "").toUpperCase();
      if (!WATCHED.has(cur)) continue;

      // Твердий фільтр по важливості: тільки medium/high
      const imp = String(ev.importance ?? "").toLowerCase();
      const importance = imp.includes("3") || imp.includes("high") ? "high"
        : imp.includes("2") || imp.includes("medium") ? "medium"
        : "low";
      if (importance === "low") continue;

      const eventTime = ev.date ? new Date(`${ev.date}T${ev.time ?? "00:00:00"}Z`) : null;
      if (!eventTime || isNaN(+eventTime)) continue;

      const { error } = await supabase.from("economic_events").upsert({
        event_time: eventTime.toISOString(),
        currency: cur,
        country: ev.country ?? null,
        title: ev.event ?? ev.title ?? "Untitled",
        importance,
        actual: ev.actual ?? null,
        forecast: ev.forecast ?? null,
        previous: ev.previous ?? null,
        unit: ev.unit ?? null,
        affected_symbols: symbolsForCurrency(cur),
        external_id: ev.event_id?.toString() ?? null,
      }, { onConflict: "event_time,currency,title" });
      if (!error) saved += 1;
    }

    return new Response(JSON.stringify({ ok: true, saved, total: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("fetch-economic-calendar", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
