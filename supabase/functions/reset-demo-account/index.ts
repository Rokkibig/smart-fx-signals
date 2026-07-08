import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supaUser.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Cancel all open trades as MANUAL with zero pnl
    await admin
      .from("demo_trades")
      .update({ status: "MANUAL", closed_at: new Date().toISOString(), realized_pnl: 0 })
      .eq("user_id", user.id)
      .eq("status", "OPEN");

    // Reset balance to 1000
    const { data: existing } = await admin
      .from("demo_accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      await admin
        .from("demo_accounts")
        .update({ balance: 1000, starting_balance: 1000, reset_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } else {
      await admin.from("demo_accounts").insert({ user_id: user.id, balance: 1000, starting_balance: 1000 });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("reset-demo-account error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
