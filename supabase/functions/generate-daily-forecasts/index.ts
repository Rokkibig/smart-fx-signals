import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

function pipSize(symbol: string): number {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

function currenciesOf(symbol: string): string[] {
  const [b, q] = symbol.split("/");
  return [b, q];
}

async function callAI(apiKey: string, system: string, user: string): Promise<any> {
  const r = await fetch(LOVABLE_GW, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t}`);
  }
  const d = await r.json();
  return JSON.parse(d.choices[0].message.content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const forecastDate = new Date().toISOString().slice(0, 10);
    const results: any[] = [];
    const skipped: any[] = [];

    for (const symbol of SYMBOLS) {
      const [base, quote] = currenciesOf(symbol);

      // 0) Blackout check
      const nowIso = new Date().toISOString();
      const { data: blackouts } = await supabase
        .from("news_blackouts")
        .select("currency, reason, ends_at")
        .in("currency", [base, quote])
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso);

      if (blackouts && blackouts.length > 0) {
        await supabase.from("daily_forecasts").upsert({
          symbol,
          forecast_date: forecastDate,
          forecast_horizon_hours: 24,
          direction: "neutral",
          probability: 50,
          price_at_forecast: 0,
          status: "SKIPPED_NEWS",
          adjustments_count: 0,
          reasoning: `Пропущено: активне news-blackout вікно (${blackouts.map((b: any) => b.reason).join("; ")}).`,
          news_context: JSON.stringify(blackouts),
          model_version: MODEL,
        }, { onConflict: "symbol,forecast_date" });
        skipped.push({ symbol, reason: "news_blackout" });
        continue;
      }

      // 1) Ціна + індикатори
      const { data: priceRow } = await supabase
        .from("forex_prices")
        .select("price")
        .eq("symbol", symbol)
        .order("price_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!priceRow) continue;
      const price = Number(priceRow.price);

      const { data: features } = await supabase
        .from("forex_features")
        .select("timeframe, last_close, ema_20, ema_50, ema_200, adx_14, rsi_14, atr_14, trend_direction, pivot_pp, pivot_r1, pivot_s1")
        .eq("symbol", symbol)
        .order("calculated_at", { ascending: false })
        .limit(4);

      // 2) Історія помилок
      const { data: stats } = await supabase
        .from("forecast_stats")
        .select("*")
        .eq("symbol", symbol)
        .maybeSingle();

      const { data: recentEvaluated } = await supabase
        .from("daily_forecasts")
        .select("forecast_date, direction, probability, actual_direction, actual_move_pips, accuracy_score")
        .eq("symbol", symbol)
        .not("evaluated_at", "is", null)
        .order("forecast_date", { ascending: false })
        .limit(10);

      // 3) Останні новини за 12 год по обох валютах
      const sinceIso = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      const { data: news } = await supabase
        .from("market_news")
        .select("headline, sentiment, impact, published_at, currency")
        .in("currency", [base, quote])
        .gte("published_at", sinceIso)
        .order("published_at", { ascending: false })
        .limit(15);

      // 4) COT — останній звіт по обох валютах
      const { data: cot } = await supabase
        .from("cot_positions")
        .select("currency, report_date, net_position, change_wow")
        .in("currency", [base, quote])
        .order("report_date", { ascending: false })
        .limit(4);

      const system = `Ти — старший FX-аналітик. Складаєш прогноз на наступні 24 години.
Використовуй ВСІ дані: технічні індикатори, останні новини (sentiment), позиціонування великих гравців (COT), історію помилок.
Формат відповіді — JSON:
{
  "direction": "up" | "down" | "neutral",
  "probability": 50-95,
  "expected_move_pips": число,
  "target_price": число,
  "stop_price": число,
  "reasoning": "2-4 речення українською: тех + фунд + ризики",
  "news_context": "коротко про поточний новинний фон"
}
Якщо news sentiment суперечить тех.аналізу — знижуй probability. Якщо COT показує екстремальне позиціонування — врахуй ризик розвороту.`;

      const userPrompt = JSON.stringify({
        symbol,
        current_price: price,
        pip_size: pipSize(symbol),
        indicators_by_tf: features,
        recent_news: news,
        cot_positioning: cot,
        historical_accuracy: stats ? {
          total: stats.total_forecasts,
          correct_direction_rate: stats.total_forecasts > 0
            ? (stats.correct_direction / stats.total_forecasts * 100).toFixed(1) + "%"
            : "n/a",
          avg_accuracy: stats.avg_accuracy,
        } : null,
        last_10_forecasts: recentEvaluated,
      }, null, 2);

      let forecast: any;
      try {
        forecast = await callAI(apiKey, system, userPrompt);
      } catch (e) {
        console.error(`AI failed for ${symbol}:`, e);
        continue;
      }

      const { error } = await supabase
        .from("daily_forecasts")
        .upsert({
          symbol,
          forecast_date: forecastDate,
          forecast_horizon_hours: 24,
          direction: forecast.direction,
          probability: forecast.probability,
          price_at_forecast: price,
          target_price: forecast.target_price ?? null,
          stop_price: forecast.stop_price ?? null,
          current_entry: price,
          current_target: forecast.target_price ?? null,
          current_stop: forecast.stop_price ?? null,
          status: "ACTIVE",
          adjustments_count: 0,
          expected_move_pips: forecast.expected_move_pips ?? null,
          reasoning: forecast.reasoning ?? null,
          news_context: forecast.news_context ?? null,
          technical_snapshot: { features, price, news_count: news?.length ?? 0, cot },
          model_version: MODEL,
        }, { onConflict: "symbol,forecast_date" });

      if (error) console.error(`Save failed ${symbol}:`, error);
      results.push({ symbol, direction: forecast.direction, probability: forecast.probability });

      await new Promise((r) => setTimeout(r, 1200));
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-daily-forecasts error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
