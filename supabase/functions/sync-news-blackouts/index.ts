import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Синхронізує news_blackouts з economic_events:
 * для кожної high-impact події створює вікно ±30 хв навколо event_time,
 * якщо ще не існує.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // майбутні / нещодавні high-impact події (від -1 год до +48 год)
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from("economic_events")
      .select("id, event_time, currency, title, importance")
      .in("importance", ["high", "High", "HIGH"])
      .gte("event_time", from)
      .lte("event_time", to);

    if (error) throw error;

    let created = 0;
    for (const ev of events ?? []) {
      const startsAt = new Date(new Date(ev.event_time).getTime() - 30 * 60 * 1000).toISOString();
      const endsAt = new Date(new Date(ev.event_time).getTime() + 30 * 60 * 1000).toISOString();

      // dedupe: чи існує blackout з такою ж event_ref?
      const { data: existing } = await supabase
        .from("news_blackouts")
        .select("id")
        .eq("event_ref", ev.id)
        .maybeSingle();
      if (existing) continue;

      const { error: insErr } = await supabase.from("news_blackouts").insert({
        currency: ev.currency,
        reason: `Economic event: ${ev.title}`,
        event_ref: ev.id,
        starts_at: startsAt,
        ends_at: endsAt,
        impact: "high",
      });
      if (!insErr) created++;
    }

    // cleanup: видалити blackouts, що закінчились > 24 год тому
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("news_blackouts").delete().lt("ends_at", cutoff);

    return new Response(JSON.stringify({ ok: true, created, checked: events?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("sync-news-blackouts error:", e);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
