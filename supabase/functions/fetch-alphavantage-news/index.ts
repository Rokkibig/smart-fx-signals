import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"];
const SYMBOL_MAP: Record<string, string[]> = {
  "EUR/USD": ["EUR", "USD"],
  "GBP/USD": ["GBP", "USD"],
  "USD/JPY": ["USD", "JPY"],
  "USD/CHF": ["USD", "CHF"],
  "AUD/USD": ["AUD", "USD"],
  "NZD/USD": ["NZD", "USD"],
  "USD/CAD": ["USD", "CAD"],
};

function parseAvTime(t: string): string {
  // "20250115T133000" -> ISO
  const y = t.slice(0, 4), mo = t.slice(4, 6), d = t.slice(6, 8);
  const h = t.slice(9, 11), mi = t.slice(11, 13), s = t.slice(13, 15);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const key = Deno.env.get("ALPHAVANTAGE_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "ALPHAVANTAGE_API_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // Alpha Vantage NEWS_SENTIMENT — forex topic, up to 200 items
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=economy_monetary,economy_macro,economy_fiscal,financial_markets&limit=200&apikey=${key}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`AV ${r.status}`);
    const data = await r.json();

    if (data.Note || data.Information) {
      return new Response(JSON.stringify({ ok: false, note: data.Note ?? data.Information }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const feed: any[] = data.feed ?? [];
    let inserted = 0, blackouts = 0;
    const now = Date.now();

    for (const item of feed) {
      const published = parseAvTime(item.time_published);
      const publishedTs = new Date(published).getTime();
      if (isNaN(publishedTs)) continue;
      // skip anything older than 24h
      if (now - publishedTs > 24 * 3600 * 1000) continue;

      const overallScore = Number(item.overall_sentiment_score ?? 0);
      const label = String(item.overall_sentiment_label ?? "");

      // determine affected currencies via topic tickers (FOREX:XXX)
      const affected = new Set<string>();
      for (const ts of item.ticker_sentiment ?? []) {
        const t = String(ts.ticker ?? "");
        if (t.startsWith("FOREX:")) {
          const c = t.slice(6);
          if (CURRENCIES.includes(c)) affected.add(c);
        }
      }
      // fallback: look for currency codes in title
      if (affected.size === 0) {
        const upper = String(item.title ?? "").toUpperCase();
        for (const c of CURRENCIES) if (upper.includes(c)) affected.add(c);
      }
      if (affected.size === 0) continue;

      const impact = Math.abs(overallScore) >= 0.35 ? "high" : Math.abs(overallScore) >= 0.15 ? "medium" : "low";

      for (const currency of affected) {
        // find matching symbols
        const symbols = Object.entries(SYMBOL_MAP)
          .filter(([, curs]) => curs.includes(currency))
          .map(([s]) => s);
        const symbol = symbols[0] ?? null;

        const { error } = await supabase.from("market_news").insert({
          symbol,
          currency,
          headline: String(item.title ?? "").slice(0, 500),
          summary: String(item.summary ?? "").slice(0, 2000),
          url: item.url,
          source: item.source,
          sentiment: overallScore,
          impact,
          published_at: published,
        });
        if (!error) inserted++;

        // High-impact → create 60-min blackout window (±30 min)
        if (impact === "high") {
          const startsAt = new Date(publishedTs - 30 * 60 * 1000).toISOString();
          const endsAt = new Date(publishedTs + 30 * 60 * 1000).toISOString();
          const { error: bErr } = await supabase.from("news_blackouts").insert({
            currency,
            reason: `News: ${String(item.title ?? "").slice(0, 160)} (${label})`,
            starts_at: startsAt,
            ends_at: endsAt,
            impact: "high",
          });
          if (!bErr) blackouts++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, inserted, blackouts, feed_size: feed.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fetch-alphavantage-news error:", e);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
