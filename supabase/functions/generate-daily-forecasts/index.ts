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

    for (const symbol of SYMBOLS) {
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

      // 2) Історія помилок для навчання
      const { data: stats } = await supabase
        .from("forecast_stats")
        .select("*")
        .eq("symbol", symbol)
        .maybeSingle();

      const { data: recentEvaluated } = await supabase
        .from("daily_forecasts")
        .select("forecast_date, direction, probability, actual_direction, actual_move_pips, accuracy_score, evaluation_notes")
        .eq("symbol", symbol)
        .not("evaluated_at", "is", null)
        .order("forecast_date", { ascending: false })
        .limit(10);

      const system = `Ти — старший FX-аналітик. Складаєш прогноз на наступні 24 години.
Формат відповіді — JSON з ключами:
{
  "direction": "up" | "down" | "neutral",
  "probability": число 50-95 (впевненість у %),
  "expected_move_pips": число (очікуваний рух у пунктах),
  "target_price": число (цільова ціна),
  "stop_price": число (інвалідація прогнозу),
  "reasoning": рядок (2-4 речення українською: тех.аналіз + макро + ризики),
  "news_context": рядок (важливі події, що можуть вплинути; якщо невідомо — "немає даних")
}
Обов'язково враховуй попередні помилки моделі — коригуй впевненість.`;

      const userPrompt = JSON.stringify({
        symbol,
        current_price: price,
        pip_size: pipSize(symbol),
        indicators_by_tf: features,
        historical_accuracy: stats ? {
          total: stats.total_forecasts,
          correct_direction_rate: stats.total_forecasts > 0 ? (stats.correct_direction / stats.total_forecasts * 100).toFixed(1) + "%" : "n/a",
          avg_accuracy: stats.avg_accuracy,
          recent_mistakes: stats.recent_mistakes,
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

      // 3) Зберігаємо (upsert по symbol+date)
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
          expected_move_pips: forecast.expected_move_pips ?? null,
          reasoning: forecast.reasoning ?? null,
          news_context: forecast.news_context ?? null,
          technical_snapshot: { features, price },
          model_version: MODEL,
        }, { onConflict: "symbol,forecast_date" });

      if (error) console.error(`Save failed ${symbol}:`, error);
      results.push({ symbol, direction: forecast.direction, probability: forecast.probability });

      // невеликий буфер, щоб не впертися у rate-limit
      await new Promise((r) => setTimeout(r, 1200));
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
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
