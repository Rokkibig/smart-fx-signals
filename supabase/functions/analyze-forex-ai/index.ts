import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { pairData } = await req.json();

    // Check user credits
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

    const systemPrompt = `Ти експерт-аналітик Forex ринку. Аналізуй валютні пари та надавай конкретні торгові рекомендації.

Формат відповіді:
- Сигнал: BUY/SELL/HOLD
- Обґрунтування (2-3 речення)
- Рівні входу/виходу
- Stop Loss та Take Profit`;

    const pairInfo = JSON.stringify(pairData, null, 2);
    const userMessage = `Проаналізуй валютну пару та надай торгову рекомендацію:\n\n${pairInfo}`;

    let analysis = '';
    let usedProvider = '';

    // Priority 1: Lovable AI (free quota)
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (LOVABLE_API_KEY) {
      try {
        console.log('Trying Lovable AI (Google Gemini)...');
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            max_tokens: 1000,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          analysis = aiData.choices[0].message.content;
          usedProvider = 'Lovable AI (Gemini Flash)';
          console.log('✓ Analysis completed with Lovable AI');
        } else if (aiResponse.status !== 429 && aiResponse.status !== 402) {
          const errorText = await aiResponse.text();
          console.error('Lovable AI error:', aiResponse.status, errorText);
        }
      } catch (error) {
        console.error('Lovable AI failed:', error);
      }
    }

    // Priority 2: Google Gemini (user's key)
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
            const errorText = await aiResponse.text();
            console.error('Google API error:', aiResponse.status, errorText);
          }
        } catch (error) {
          console.error('Google Gemini failed:', error);
        }
      }
    }

    // Priority 3: Groq (user's key)
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
            const errorText = await aiResponse.text();
            console.error('Groq API error:', aiResponse.status, errorText);
          }
        } catch (error) {
          console.error('Groq failed:', error);
        }
      }
    }

    // Priority 4: Claude (user's key)
    if (!analysis) {
      const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
      if (ANTHROPIC_API_KEY) {
        try {
          console.log('Trying Claude API...');
          const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5',
              max_tokens: 1024,
              system: systemPrompt,
              messages: [{ role: 'user', content: userMessage }],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            analysis = aiData.content[0].text;
            usedProvider = 'Claude Sonnet 4.5';
            console.log('✓ Analysis completed with Claude');
          } else {
            const errorText = await aiResponse.text();
            console.error('Claude API error:', aiResponse.status, errorText);
          }
        } catch (error) {
          console.error('Claude failed:', error);
        }
      }
    }

    // If all providers failed
    if (!analysis) {
      return new Response(
        JSON.stringify({ error: 'All AI providers are currently unavailable. Please try again later.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analysis completed successfully using: ${usedProvider}`);

    // Deduct 1 credit
    await supabase
      .from('user_credits')
      .update({ 
        credits_balance: credits.credits_balance - 1,
        total_spent: (credits.total_spent || 0) + 1
      })
      .eq('user_id', user.id);

    // Log the request
    await supabase
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
        credits_remaining: credits.credits_balance - 1
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-forex-ai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
