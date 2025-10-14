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

    // Call Claude Sonnet 4.5 directly through Anthropic API
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('Analyzing with Claude Sonnet 4.5 via Anthropic API...');

    const systemPrompt = `Ти експерт-аналітик Forex ринку. Аналізуй валютні пари та надавай конкретні торгові рекомендації.

Формат відповіді:
1. Напрямок: BUY/SELL/HOLD
2. Entry Price (точна ціна входу)
3. Stop Loss (точна ціна SL)
4. Take Profit 1 та 2 (точні ціни TP)
5. Ймовірність успіху (%)
6. Короткий аналіз (2-3 речення чому саме така рекомендація)

Базуйся на технічному аналізі, трендах та силі руху.`;

    const pairInfo = JSON.stringify(pairData, null, 2);

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
        messages: [
          { 
            role: 'user', 
            content: `Проаналізуй валютну пару та надай торгову рекомендацію:\n\n${pairInfo}` 
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Claude API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key. Please check your Claude API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Claude API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.content[0].text;
    console.log('Analysis completed successfully');

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
