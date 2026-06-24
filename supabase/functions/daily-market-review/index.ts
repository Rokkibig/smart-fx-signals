import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
const TIMEFRAMES = ["D1", "H4", "H1", "M15"];

function getSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 13) return "london";
  if (h >= 13 && h < 20) return "ny";
  return "overnight";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // 1. Збираємо features для всіх пар × таймфреймів
    const rawFeatures: Record<string, any> = {};
    for (const symbol of SYMBOLS) {
      rawFeatures[symbol] = {};
      for (const tf of TIMEFRAMES) {
        const { data } = await supabaseAdmin.rpc("get_latest_features", {
          p_symbol: symbol,
          p_timeframe: tf,
        });
        if (data && data[0]) {
          const f = data[0];
          rawFeatures[symbol][tf] = {
            close: f.last_close,
            ema20: f.ema_20,
            ema50: f.ema_50,
            ema200: f.ema_200,
            adx: f.adx_14,
            rsi: f.rsi_14,
            atr: f.atr_14,
            trend: f.trend_direction,
            pivots: tf === "D1" ? { pp: f.pivot_pp, r1: f.pivot_r1, r2: f.pivot_r2, s1: f.pivot_s1, s2: f.pivot_s2 } : undefined,
          };
        }
      }
    }

    // 2. Один промпт для всіх пар
    const session = getSession();
    const systemPrompt = `Ти професійний Forex-аналітик. Дай КОРОТКИЙ огляд ринку для сесії "${session}" українською мовою.
Використовуй наведені дані по 7 валютних парах (D1/H4/H1/M15: EMA, ADX, RSI, ATR, тренд + D1 пивоти).

ФОРМАТ (СУВОРО, Markdown):

**🌍 Загальний контекст ринку**
2-3 речення: USD-сила, ризик-апетит, ключові ноти сесії.

**📊 Карта пар**
Таблиця або компактний список — для кожної з 7 пар:
- **PAIR** — Bias (BULL/BEAR/RANGE), ключовий рівень, що чекати.

**🎯 Топ-3 ідеї сесії**
3 буліти з найкращим R:R: пара, напрямок, тригер, інвалідація.

**⚠️ Що уникати**
1-2 речення: де ринок неясний / небезпечно.

Без води. Конкретні рівні. Якщо дані суперечливі — пиши WAIT.`;

    const userMessage = `Дані (JSON):\n\`\`\`json\n${JSON.stringify(rawFeatures, null, 2)}\n\`\`\``;

    // 3. Lovable AI Gateway (Gemini 2.5 Flash)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) throw new Error("Rate limit на Lovable AI Gateway, спробуйте пізніше");
      if (aiResp.status === 402) throw new Error("Закінчились AI кредити воркспейсу");
      throw new Error(`Lovable AI error ${aiResp.status}: ${errText}`);
    }

    const aiData = await aiResp.json();
    const marketContext = aiData.choices[0].message.content;

    // 4. Зберігаємо
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("daily_market_reviews")
      .insert({
        session,
        market_context: marketContext,
        pairs_analysis: rawFeatures,
        raw_features: rawFeatures,
        ai_provider: "Lovable AI / Gemini 2.5 Flash",
      })

      .select()
      .single();

    if (insErr) throw insErr;

    return new Response(JSON.stringify({ success: true, review: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("daily-market-review error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
