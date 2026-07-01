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

    // === 4. MASTER DECISION — тільки bias + idea-кандидати (JSON), без SL/TP ===
    const masterSys = `Ти Master Decision Agent (Senior Forex Strategist). Дано: дані ринку (індикатори+live_price), тези Bull, тези Bear.
Твоя роль — ЗВАЖИТИ дебати та повернути СТРОГИЙ JSON. НЕ рахуй SL/TP/RR — це зробить окремий Risk Guard.

Поверни ЛИШЕ валідний JSON без markdown/коментарів у форматі:
{
  "context": "2-3 речення про USD, ризик-апетит, сесію",
  "map": [ { "pair": "EUR/USD", "bias": "BULL|BEAR|RANGE|WAIT", "key_level": 1.0850, "note": "коротко" } ],
  "ideas": [
    { "pair": "EUR/USD", "side": "LONG|SHORT", "entry_ref": "live|s1|r1|pp|s2|r2", "trigger": "коротко", "reason": "чому переміг Bull/Bear (1 речення)", "confidence": 0.65 }
  ],
  "avoid": "1-2 речення чого уникати"
}

Правила:
- map: всі 7 пар.
- ideas: 2-4 найкращі кандидати (не всі 7).
- entry_ref: тільки одне з переліку — реальний код рівня, а не число.
- confidence: 0..1.
- Якщо все нейтрально — ideas: [].`;

    const masterUser = `${dataBlock}\n\n---\n\n${bullThesis}\n\n---\n\n${bearThesis}`;
    const masterRaw = await callAI(LOVABLE_API_KEY, MODEL_STRONG, masterSys, masterUser);

    // Витягуємо JSON (навіть якщо модель обгорнула у ```json)
    let master: any = null;
    try {
      const jsonMatch = masterRaw.match(/\{[\s\S]*\}/);
      master = JSON.parse(jsonMatch ? jsonMatch[0] : masterRaw);
    } catch (_) {
      master = { context: "Master не повернув валідний JSON", map: [], ideas: [], avoid: "", raw: masterRaw };
    }

    // === 5. RISK GUARD — детермінований розрахунок SL/TP/RR ===
    const ADX_MIN = 20;
    const SL_ATR_MULT = 1.5;
    const TP_ATR_MULT = 2.5;
    const MAX_ENTRY_DEVIATION_ATR = 0.5; // entry має бути в межах 0.5*ATR від live

    type GuardedIdea = {
      pair: string;
      side: "LONG" | "SHORT";
      entry: number;
      sl: number;
      tp: number;
      rr: number;
      trigger: string;
      reason: string;
      confidence: number;
      risk_status: "OK" | "REJECTED";
      risk_notes: string[];
    };

    const guardedIdeas: GuardedIdea[] = [];
    const rejected: Array<{ pair: string; side: string; reason: string }> = [];

    for (const idea of (master.ideas ?? []) as any[]) {
      const notes: string[] = [];
      const pair = idea?.pair;
      const side = (idea?.side || "").toUpperCase();
      const f = rawFeatures[pair];
      if (!f || !f.live_price || !f.H1) {
        rejected.push({ pair, side, reason: "Немає live_price або H1 features" });
        continue;
      }
      const live = f.live_price;
      const atr = f.H1.atr ?? 0;
      const adx = f.H1.adx ?? 0;
      const d1 = f.D1?.pivots ?? {};

      if (side !== "LONG" && side !== "SHORT") {
        rejected.push({ pair, side, reason: "Невалідний side" });
        continue;
      }
      if (atr <= 0) {
        rejected.push({ pair, side, reason: "ATR=0" });
        continue;
      }
      if (adx < ADX_MIN) {
        rejected.push({ pair, side, reason: `ADX ${adx?.toFixed(1)} < ${ADX_MIN} (немає тренду)` });
        continue;
      }

      // Визначаємо entry за entry_ref
      const ref = String(idea?.entry_ref || "live").toLowerCase();
      const refMap: Record<string, number | undefined> = {
        live, pp: d1.pp, r1: d1.r1, r2: d1.r2, s1: d1.s1, s2: d1.s2,
      };
      let entry = refMap[ref];
      if (entry === undefined || !isFinite(entry)) {
        notes.push(`entry_ref=${ref} недоступний, fallback → live`);
        entry = live;
      }
      // Валідація: entry не має бути далеко від live
      const dev = Math.abs(entry - live);
      if (dev > MAX_ENTRY_DEVIATION_ATR * atr) {
        notes.push(`entry ${entry.toFixed(5)} задалеко від live ${live.toFixed(5)} (>${MAX_ENTRY_DEVIATION_ATR}·ATR) → clamp до live`);
        entry = live;
      }

      // SL/TP через ATR
      const dir = side === "LONG" ? 1 : -1;
      const sl = entry - dir * SL_ATR_MULT * atr;
      const tp = entry + dir * TP_ATR_MULT * atr;
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      const rr = risk > 0 ? reward / risk : 0;

      guardedIdeas.push({
        pair, side, entry, sl, tp, rr,
        trigger: idea?.trigger || "",
        reason: idea?.reason || "",
        confidence: Number(idea?.confidence ?? 0),
        risk_status: "OK",
        risk_notes: notes,
      });
    }

    // === 6. Рендер фінального markdown ===
    const fmt = (n: number) => (isFinite(n) ? n.toFixed(5) : "—");
    const mapMd = (master.map ?? [])
      .map((m: any) => `- \`${m.pair}\` — **${m.bias}** @ ${m.key_level ?? "—"} — ${m.note ?? ""}`)
      .join("\n");
    const ideasMd = guardedIdeas.length
      ? guardedIdeas.map(g =>
          `- **${g.pair} ${g.side}** @ ${fmt(g.entry)} | SL ${fmt(g.sl)} | TP ${fmt(g.tp)} | R:R ${g.rr.toFixed(2)} | conf ${(g.confidence*100).toFixed(0)}%\n  Тригер: ${g.trigger}\n  Обґрунтування: ${g.reason}${g.risk_notes.length ? `\n  _Risk Guard: ${g.risk_notes.join("; ")}_` : ""}`
        ).join("\n")
      : "_Немає ідей що пройшли Risk Guard (ADX<20 або немає даних)_";
    const rejectedMd = rejected.length
      ? `\n\n**🛡️ Відхилено Risk Guard:**\n` + rejected.map(r => `- ${r.pair} ${r.side}: ${r.reason}`).join("\n")
      : "";

    const finalMd = `**🌍 Загальний контекст ринку (${session})**
${master.context ?? "—"}

**📊 Карта пар**
${mapMd || "—"}

**🎯 Топ-ідеї (пройшли Risk Guard: ADX≥${ADX_MIN}, SL=${SL_ATR_MULT}·ATR, TP=${TP_ATR_MULT}·ATR)**
${ideasMd}

**⚠️ Що уникати**
${master.avoid ?? "—"}${rejectedMd}

---

<details>
<summary>🧠 Деталі дебатів (Bull vs Bear)</summary>

${bullThesis}

${bearThesis}

</details>`;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("daily_market_reviews")
      .insert({
        session,
        market_context: finalMd,
        pairs_analysis: { features: rawFeatures, master, guarded_ideas: guardedIdeas, rejected },
        raw_features: rawFeatures,
        ai_provider: "Lovable AI / Bull+Bear (Flash-Lite) + Master (Gemini 2.5 Pro) + Risk Guard (deterministic TS)",
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
