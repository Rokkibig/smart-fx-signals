// Auto-backfill snapshots for pairs currently flagged INSUFFICIENT_HISTORY.
// Runs on a cron; picks up symbols from recent daily_forecasts and expands
// their historical snapshot pool by invoking backfill-snapshots with stride=1.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find symbols flagged INSUFFICIENT_HISTORY in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("daily_forecasts")
    .select("symbol,status,created_at")
    .eq("status", "INSUFFICIENT_HISTORY")
    .gte("created_at", since);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const symbols = Array.from(new Set((rows ?? []).map((r: any) => r.symbol)));
  if (symbols.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_insufficient_pairs" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Delegate to backfill-snapshots with dense stride
  const { data, error: e2 } = await supabase.functions.invoke("backfill-snapshots", {
    body: { pairs: symbols, stride: 1 },
  });
  if (e2) {
    return new Response(JSON.stringify({ error: e2.message, symbols }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, symbols, backfill: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
