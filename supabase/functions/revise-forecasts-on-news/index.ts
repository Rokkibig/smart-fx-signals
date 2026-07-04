import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

async function callAI(apiKey: string, system: string, user: string): Promise<any> {
  const r = await fetch(LOVABLE_GW, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Знаходимо події, що вийшли за останні 45 хв, ще не оброблені,
    // з фактичним значенням (actual != null)
    const since = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const untilFuture = new Date(Date.now() + 60 * 1000).toISOString();

    const { data: events, error: evErr } = await supabase
      .from("economic_events")
      .select("*")
      .is("processed_at", null)
      .gte("event_time", since)
      .lte("event_time", untilFuture)
      .not("actual", "is", null)
      .order("event_time", { ascending: true })
      .limit(20);
    if (evErr) throw evErr;

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, revised: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    let revised = 0;

    for (const ev of events) {
      const symbols: string[] = ev.affected_symbols ?? [];
      for (const symbol of symbols) {
        const { data: forecast } = await supabase
          .from("daily_forecasts")
          .select("*")
          .eq("symbol", symbol)
          .eq("forecast_date", today)
          .is("evaluated_at", null)
          .maybeSingle();
        if (!forecast) continue;

        const { data: priceRow } = await supabase
          .from("forex_prices")
          .select("price")
          .eq("symbol", symbol)
          .order("price_timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        const currentPrice = priceRow ? Number(priceRow.price) : Number(forecast.price_at_forecast);

        const system = `Ти — старший FX-аналітик. Тільки що вийшла економічна новина.
Переглянь поточний денний прогноз і скажи, чи його треба скоригувати.
Відповідь — JSON:
{
  "keep": true|false,
  "direction": "up"|"down"|"neutral",
  "probability": 50-95,
  "target_price": число|null,
  "stop_price": число|null,
  "reasoning": "1-3 речення українською: як новина вплинула і чому саме така корекція"
}
Якщо факт близький до прогнозу — probability знижуй помірно; якщо різко відхиляється — можеш змінити напрямок.`;

        const userMsg = JSON.stringify({
          symbol,
          current_price: currentPrice,
          current_forecast: {
            direction: forecast.direction,
            probability: forecast.probability,
            target_price: forecast.target_price,
            stop_price: forecast.stop_price,
            price_at_forecast: forecast.price_at_forecast,
            reasoning: forecast.reasoning,
          },
          news_event: {
            time: ev.event_time,
            currency: ev.currency,
            title: ev.title,
            importance: ev.importance,
            actual: ev.actual,
            forecast: ev.forecast,
            previous: ev.previous,
            unit: ev.unit,
          },
        }, null, 2);

        let ai: any;
        try {
          ai = await callAI(apiKey, system, userMsg);
        } catch (e) {
          console.error(`AI failed ${symbol}:`, e);
          continue;
        }

        // Пишемо ревізію в історію
        await supabase.from("forecast_revisions").insert({
          forecast_id: forecast.id,
          event_id: ev.id,
          symbol,
          prev_direction: forecast.direction,
          prev_probability: forecast.probability,
          new_direction: ai.direction ?? forecast.direction,
          new_probability: ai.probability ?? forecast.probability,
          new_target_price: ai.target_price ?? forecast.target_price,
          new_stop_price: ai.stop_price ?? forecast.stop_price,
          price_at_revision: currentPrice,
          reasoning: ai.reasoning ?? null,
          trigger: "news",
        });

        // Якщо AI вирішив змінити — оновлюємо основний прогноз
        if (ai.keep === false) {
          await supabase.from("daily_forecasts").update({
            direction: ai.direction ?? forecast.direction,
            probability: ai.probability ?? forecast.probability,
            target_price: ai.target_price ?? forecast.target_price,
            stop_price: ai.stop_price ?? forecast.stop_price,
            reasoning: `[оновлено після новини "${ev.title}"] ${ai.reasoning ?? ""}\n\nПопереднє: ${forecast.reasoning ?? ""}`,
          }).eq("id", forecast.id);
        }
        revised += 1;
        await new Promise((r) => setTimeout(r, 1000));
      }

      await supabase.from("economic_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", ev.id);
    }

    return new Response(JSON.stringify({ ok: true, revised, events: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("revise-forecasts-on-news", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
