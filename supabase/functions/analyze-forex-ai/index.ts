import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const pairDataSchema = z.object({
  pair: z.string().trim().min(1).max(20),
  price: z.number().positive().optional(),
  trend: z.string().trim().max(10).optional(),
  strength: z.number().min(0).max(100).optional(),
  trend_matrix: z.object({
    D1: z.string().trim().max(10).optional(),
    H4: z.string().trim().max(10).optional(),
    H1: z.string().trim().max(10).optional(),
    M15: z.string().trim().max(10).optional(),
  }).strict().optional(),
}).strict();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const requestId = crypto.randomUUID();
    const body = await req.json();
    
    // Validate input
    const validationResult = pairDataSchema.safeParse(body.pairData);
    if (!validationResult.success) {
      console.error('Validation failed:', { requestId, errors: validationResult.error.errors });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request data format',
          request_id: requestId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const pairData = validationResult.data;

    // Check and deduct credit FIRST (with optimistic locking to prevent race conditions)
    const { data: credits, error: creditsError } = await supabase
      .from('user_credits')
      .select('credits_balance, total_spent')
      .eq('user_id', user.id)
      .single();

    if (creditsError || !credits || credits.credits_balance < 1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits. Please purchase more credits.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct credit BEFORE AI processing to prevent race conditions
    const { data: deductResult, error: deductError } = await supabase
      .from('user_credits')
      .update({ 
        credits_balance: credits.credits_balance - 1,
        total_spent: (credits.total_spent || 0) + 1
      })
      .eq('user_id', user.id)
      .eq('credits_balance', credits.credits_balance) // Optimistic lock - only succeeds if balance unchanged
      .select()
      .single();

    if (deductError || !deductResult) {
      console.error('Credit deduction failed (likely concurrent request):', { requestId, error: deductError });
      return new Response(
        JSON.stringify({ error: 'Credit deduction failed. Please try again.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newBalance = deductResult.credits_balance;

    const systemPrompt = `Ти професійний Forex-аналітик з 15+ роками досвіду (price action + multi-timeframe).
Твоя задача — на основі наданих даних дати ЧІТКИЙ торговий план українською мовою.
Відповідай лаконічно, тільки по суті, без води. Використовуй Markdown.

ПРАВИЛА АНАЛІЗУ:
1. Multi-timeframe: D1/H4 = напрямок тренду, H1 = структура, M15 = вхід.
   - Якщо D1 та H4 однонаправлені → шукай вхід ЗА трендом на H1/M15.
   - Якщо timeframes суперечать → сигнал WAIT (не торгуй проти старшого ТФ).
2. ADX < 20 → ринок у флеті, уникай трендових входів (range-стратегія або WAIT).
3. RSI: перепроданість <30 / перекупленість >70 — лише підтвердження, не вхід сам по собі.
4. Pivots (PP/R1/R2/S1/S2) — основні рівні для входу/SL/TP.
5. R:R мінімум 1:1.5. Якщо неможливо досягти — WAIT.
6. SL завжди за технічним рівнем (swing high/low, ATR×1.5), не "круглим числом".

ФОРМАТ ВІДПОВІДІ (СУВОРО):

**📊 Контекст ринку**
1-2 речення: куди дивиться ринок (тренд по D1/H4, фаза — імпульс/корекція/флет).

**🎯 Сигнал: BUY / SELL / WAIT**

**💡 Обґрунтування** (3-4 буліти)
- Тренд-матриця: D1/H4/H1/M15
- Ключовий тригер (рівень, патерн, дивергенція)
- Сила тренду (ADX) + моментум (RSI)
- Що б скасувало сценарій

**📍 Торговий план** (тільки якщо BUY/SELL, пропусти при WAIT)
- **Entry:** <ціна> (ринково / лімітом від рівня X)
- **Stop Loss:** <ціна> (-XX пунктів, за <обґрунтування>)
- **Take Profit 1:** <ціна> (+XX пунктів, R:R 1:X)
- **Take Profit 2:** <ціна> (+XX пунктів, R:R 1:X)
- **Розмір позиції:** не більше 1-2% депозиту на угоду

**⚠️ Впевненість:** низька / середня / висока — 1 речення чому.

Якщо WAIT — поясни КОНКРЕТНО, які умови чекаєш (наприклад: "ретест 1.0850 з бичачою свічкою на M15 + ADX>25").`;

    const pairInfo = JSON.stringify(pairData, null, 2);
    const userMessage = `Проаналізуй цю валютну пару за наданими даними:\n\n${pairInfo}\n\nДотримуйся формату зі systemPrompt. Конкретні цифри обов'язкові.`;

    let analysis = '';
    let usedProvider = '';

    // Wrap AI calls in try-catch to refund credit if they fail
    try {
      // Priority 1: Google Gemini (user's key)
      if (!analysis) {
        const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
        if (GOOGLE_API_KEY) {
          try {
            console.log('Trying Google Gemini API...');
            const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `${systemPrompt}\n\n${userMessage}`
                  }]
                }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 1000,
                }
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              analysis = aiData.candidates[0].content.parts[0].text;
              usedProvider = 'Google Gemini';
              console.log('✓ Analysis completed with Google Gemini');
            } else {
              console.error('Google API error:', { requestId, status: aiResponse.status });
            }
          } catch (error) {
            console.error('Google Gemini failed:', { requestId, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }

      // Priority 2: Groq (user's key)
      if (!analysis) {
        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
        if (GROQ_API_KEY) {
          try {
            console.log('Trying Groq API...');
            const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userMessage }
                ],
                max_tokens: 1000,
                temperature: 0.7,
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              analysis = aiData.choices[0].message.content;
              usedProvider = 'Groq (Llama 3.3)';
              console.log('✓ Analysis completed with Groq');
            } else {
              console.error('Groq API error:', { requestId, status: aiResponse.status });
            }
          } catch (error) {
            console.error('Groq failed:', { requestId, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }

      // Claude Sonnet 4.5 - заглушка (вимкнено)
      // TODO: Додати Claude Sonnet 4.5 пізніше
      if (!analysis) {
        console.log('Claude Sonnet 4.5 currently disabled (placeholder)');
      }

      // If all providers failed
      if (!analysis) {
        console.error('All AI providers failed:', { requestId });
        // Refund the credit since AI failed
        await supabase
          .from('user_credits')
          .update({ credits_balance: credits.credits_balance })
          .eq('user_id', user.id);
        
        return new Response(
          JSON.stringify({ 
            error: 'AI analysis service temporarily unavailable. Please try again later.',
            request_id: requestId
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Analysis completed successfully using: ${usedProvider}`);
    } catch (aiError) {
      // Refund the credit if AI processing failed
      console.error('AI processing error, refunding credit:', { requestId, error: aiError });
      await supabase
        .from('user_credits')
        .update({ credits_balance: credits.credits_balance })
        .eq('user_id', user.id);
      
      throw aiError; // Re-throw to be caught by outer catch
    }

    // Log the request using service role for INSERT (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    await supabaseAdmin
      .from('ai_requests_log')
      .insert({
        user_id: user.id,
        request_type: 'forex_analysis',
        credits_used: 1,
        request_data: pairData,
        response_data: { analysis }
      });

    return new Response(
      JSON.stringify({ 
        analysis,
        credits_remaining: newBalance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error('Error in analyze-forex-ai:', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return new Response(
      JSON.stringify({ 
        error: 'Unable to process your request. Please try again later.',
        request_id: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
