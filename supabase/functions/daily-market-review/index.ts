import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
const TIMEFRAMES = ["D1", "H4", "H1", "M15"];

const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL_FAST = "google/gemini-2.5-flash-lite";
const MODEL_STRONG = "google/gemini-2.5-pro";

function getSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 13) return "london";
  if (h >= 13 && h < 20) return "ny";
  return "overnight";
}

async function callAI(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const r = await fetch(LOVABLE_GW, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new Error("Rate limit на Lovable AI Gateway, спробуйте пізніше");
    if (r.status === 402) throw new Error("Закінчились AI кредити воркспейсу");
    throw new Error(`Lovable AI ${model} error ${r.status}: ${t}`);
  }
  const d = await r.json();
  return d.choices[0].message.content as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // 1. Збираємо features + live ціни
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
      // live price
      const { data: lp } = await supabaseAdmin.rpc("get_latest_forex_price", { p_symbol: symbol });
      if (lp && lp[0]) rawFeatures[symbol].live_price = lp[0].price;
    }

    const session = getSession();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const dataBlock = `Сесія: **${session}**\n\nДані по 7 парах (D1/H4/H1/M15: EMA, ADX, RSI, ATR, trend, D1-пивоти + live_price):\n\`\`\`json\n${JSON.stringify(rawFeatures, null, 2)}\n\`\`\``;

    // === 2. BULL АГЕНТ (оптиміст) ===
    const bullSys = `Ти Bull-аналітик Forex. Твоя єдина роль — знайти НАЙСИЛЬНІШІ аргументи на LONG (купівлю) серед 7 пар.
Шукай: висхідні тренди (EMA20>EMA50>EMA200), ADX>20, відскоки від D1 S1/S2, RSI вихід з перепроданості, USD-слабкість.
Формат (Markdown, коротко, українською):
**🐂 BULL ТЕЗИ**
Для 2-3 найкращих LONG-кандидатів:
- **PAIR** — чому LONG (індикатори+рівні), live_price, ключовий тригер, інвалідація.
Не вигадуй ціни — бери з live_price та pivot-рівнів.`;
    const bullThesis = await callAI(LOVABLE_API_KEY, MODEL_FAST, bullSys, dataBlock);

    // === 3. BEAR АГЕНТ (песиміст) ===
    const bearSys = `Ти Bear-аналітик Forex. Твоя єдина роль — знайти НАЙСИЛЬНІШІ аргументи на SHORT (продаж) серед 7 пар.
Шукай: низхідні тренди (EMA20<EMA50<EMA200), ADX>20, відбиття від D1 R1/R2, RSI вихід з перекупленості, USD-сила, дивергенції, ризики.
Формат (Markdown, коротко, українською):
**🐻 BEAR ТЕЗИ**
Для 2-3 найкращих SHORT-кандидатів:
- **PAIR** — чому SHORT (індикатори+рівні), live_price, ключовий тригер, інвалідація.
Не вигадуй ціни — бери з live_price та pivot-рівнів.`;
    const bearThesis = await callAI(LOVABLE_API_KEY, MODEL_FAST, bearSys, dataBlock);

    // === 4. MASTER DECISION (сильна модель зважує дебати) ===
    const masterSys = `Ти Master Decision Agent (Senior Forex Strategist). Тобі дано:
1. Дані ринку (індикатори + live_price);
2. Тези Bull-аналітика;
3. Тези Bear-аналітика.

Твоя задача — НЕ переказувати їх, а ЗВАЖИТИ дебати: де Bull сильніший, де Bear, де неясно (WAIT).
Використовуй ВИКЛЮЧНО live_price для entry та D1-пивоти/round-levels для SL/TP.

ФОРМАТ (Markdown, українською, без води):

**🌍 Загальний контекст ринку (${session})**
2-3 речення: USD-сила, ризик-апетит, нота сесії.

**📊 Карта пар**
Для кожної з 7 пар: \`PAIR\` — Bias (BULL/BEAR/RANGE/WAIT), live=X.XXXX, ключовий рівень.

**🎯 Топ-3 ідеї сесії (зважений вердикт дебатів)**
3 буліти з найкращим R:R:
- **PAIR LONG/SHORT** @ live_price, SL: рівень, TP: рівень, R:R ≈ X, тригер, чому переміг Bull/Bear.

**⚠️ Що уникати**
1-2 речення.

Якщо дані суперечливі — чесно пиши WAIT.`;

    const masterUser = `${dataBlock}\n\n---\n\n${bullThesis}\n\n---\n\n${bearThesis}`;
    const masterDecision = await callAI(LOVABLE_API_KEY, MODEL_STRONG, masterSys, masterUser);

    // === 5. Фінальний markdown (дебати + вердикт) ===
    const finalMd = `${masterDecision}\n\n---\n\n<details>\n<summary>🧠 Деталі дебатів (Bull vs Bear)</summary>\n\n${bullThesis}\n\n${bearThesis}\n\n</details>`;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("daily_market_reviews")
      .insert({
        session,
        market_context: finalMd,
        pairs_analysis: rawFeatures,
        raw_features: rawFeatures,
        ai_provider: "Lovable AI / Bull+Bear (Flash-Lite) + Master (Gemini 2.5 Pro)",
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
