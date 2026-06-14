import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREDITS_COST = 2;

const bodySchema = z.object({
  // data URL: data:image/png;base64,XXXX  (max ~7MB base64 => ~9.3M chars; keep safe limit)
  image: z.string().min(50).max(12_000_000),
  pair: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();

function parseDataUrl(dataUrl: string): { mime: string; b64: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1].toLowerCase().replace("image/jpg", "image/jpeg"), b64: m[2] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { image, pair, notes } = parsed.data;
    const img = parseDataUrl(image);
    if (!img) {
      return new Response(
        JSON.stringify({ error: "Image must be a data URL (png/jpeg/webp)", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check & deduct credits with optimistic lock
    const { data: credits, error: cErr } = await supabase
      .from("user_credits")
      .select("credits_balance, total_spent")
      .eq("user_id", user.id)
      .single();

    if (cErr || !credits || credits.credits_balance < CREDITS_COST) {
      return new Response(
        JSON.stringify({
          error: `Недостатньо кредитів. Потрібно ${CREDITS_COST}. Поточний баланс: ${credits?.credits_balance ?? 0}.`,
          credits_needed: CREDITS_COST,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: deduct, error: dErr } = await supabase
      .from("user_credits")
      .update({
        credits_balance: credits.credits_balance - CREDITS_COST,
        total_spent: (credits.total_spent || 0) + CREDITS_COST,
      })
      .eq("user_id", user.id)
      .eq("credits_balance", credits.credits_balance)
      .select()
      .single();

    if (dErr || !deduct) {
      return new Response(
        JSON.stringify({ error: "Не вдалось списати кредити, спробуйте ще раз", request_id: requestId }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const newBalance = deduct.credits_balance;

    const refund = async () => {
      await supabase
        .from("user_credits")
        .update({
          credits_balance: credits.credits_balance,
          total_spent: credits.total_spent || 0,
        })
        .eq("user_id", user.id);
    };

    const systemPrompt = `Ти професійний трейдер-аналітик Forex з 15+ роками досвіду читання графіків.
Користувач надає скріншот цінового графіка. Уважно проаналізуй його та дай чіткий торговий план українською мовою.

Структура відповіді (Markdown):
**Що бачу на графіку**
- Інструмент (якщо видно) та таймфрейм
- Поточна тенденція (висхідна/низхідна/боковик)
- Ключові рівні підтримки/опору з цифрами
- Графічні патерни (трикутник, голова-плечі, прапорець, подвійна вершина тощо)
- Свічкові формації біля краю

**Технічні індикатори** (якщо є на графіку)
- EMA / MA, RSI, MACD, об'єми тощо — що показують

**Торговий план**
- Сигнал: BUY / SELL / WAIT
- Точка входу (ціна або умова)
- Stop Loss (з обґрунтуванням)
- Take Profit 1 / 2
- R:R співвідношення
- Сценарій-альтернатива (якщо ціна піде проти)

**Рівень впевненості:** низький / середній / високий + 1 речення чому.

Якщо зображення НЕ є графіком ціни — чесно скажи це й попроси завантажити правильний скрін.`;

    const userText = [
      pair ? `Валютна пара/інструмент: ${pair}` : null,
      notes ? `Коментар користувача: ${notes}` : null,
      "Проаналізуй цей графік:",
    ].filter(Boolean).join("\n");

    let analysis = "";
    let usedProvider = "";

    try {
      // Use Google Gemini (vision-capable). Prefer GOOGLE_API_KEY (same as analyze-forex-ai),
      // fallback to Lovable AI Gateway.
      const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
      if (GOOGLE_API_KEY) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `${systemPrompt}\n\n${userText}` },
                  { inline_data: { mime_type: img.mime, data: img.b64 } },
                ],
              }],
              generationConfig: { temperature: 0.6, maxOutputTokens: 1500 },
            }),
          },
        );
        if (r.ok) {
          const d = await r.json();
          analysis = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (analysis) usedProvider = "Google Gemini 2.0 Flash (vision)";
        } else {
          console.error("Google vision error", requestId, r.status, await r.text());
        }
      }

      if (!analysis) {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (LOVABLE_API_KEY) {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": LOVABLE_API_KEY,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userText },
                    { type: "image_url", image_url: { url: image } },
                  ],
                },
              ],
              temperature: 0.6,
              max_tokens: 1500,
            }),
          });
          if (r.ok) {
            const d = await r.json();
            analysis = d?.choices?.[0]?.message?.content ?? "";
            if (analysis) usedProvider = "Lovable AI Gateway (Gemini 2.5 Pro)";
          } else {
            console.error("Lovable AI error", requestId, r.status, await r.text());
          }
        }
      }

      if (!analysis) {
        await refund();
        return new Response(
          JSON.stringify({
            error: "AI vision сервіс тимчасово недоступний. Кредити повернуто.",
            request_id: requestId,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch (e) {
      console.error("AI vision crashed", requestId, e);
      await refund();
      throw e;
    }

    // Log (service role)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await supabaseAdmin.from("ai_requests_log").insert({
      user_id: user.id,
      request_type: "chart_image_analysis",
      credits_used: CREDITS_COST,
      request_data: { pair: pair ?? null, notes: notes ?? null, mime: img.mime },
      response_data: { analysis, provider: usedProvider },
    });

    return new Response(
      JSON.stringify({ analysis, provider: usedProvider, credits_remaining: newBalance }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("analyze-chart-image fatal", requestId, error);
    return new Response(
      JSON.stringify({ error: "Не вдалось обробити запит", request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
