import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_TO_TIER: Record<string, { tier: string; credits: number }> = {
  price_1ThbkPKyy4XO4xyTcWp8e29Q: { tier: "Pro", credits: 100 },
  price_1ThbkpKyy4XO4xyTbZsfMCVk: { tier: "VIP", credits: 500 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await authClient.auth.getUser(token);
    if (!user?.email) throw new Error("Not authenticated");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      await admin.from("subscribers").upsert({
        user_id: user.id,
        email: user.email,
        subscribed: false,
        subscription_tier: null,
        subscription_end: null,
      }, { onConflict: "user_id" });
      return new Response(JSON.stringify({ subscribed: false, tier: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    let subscribed = false;
    let tier: string | null = null;
    let endDate: string | null = null;
    let creditsToGrant = 0;
    let periodKey: string | null = null;

    if (subs.data.length > 0) {
      const sub = subs.data[0];
      subscribed = true;
      const priceId = sub.items.data[0].price.id;
      const info = PRICE_TO_TIER[priceId];
      tier = info?.tier ?? "Pro";
      creditsToGrant = info?.credits ?? 0;
      endDate = new Date(sub.current_period_end * 1000).toISOString();
      periodKey = `${sub.id}_${sub.current_period_start}`;
    }

    // Get previous subscriber record
    const { data: prev } = await admin
      .from("subscribers")
      .select("last_credit_grant_period")
      .eq("user_id", user.id)
      .maybeSingle();

    await admin.from("subscribers").upsert({
      user_id: user.id,
      email: user.email,
      stripe_customer_id: customerId,
      subscribed,
      subscription_tier: tier,
      subscription_end: endDate,
      last_credit_grant_period: periodKey ?? prev?.last_credit_grant_period ?? null,
    }, { onConflict: "user_id" });

    // Grant monthly credits if new billing period
    if (subscribed && periodKey && prev?.last_credit_grant_period !== periodKey && creditsToGrant > 0) {
      const { data: creditRow } = await admin
        .from("user_credits")
        .select("credits_balance")
        .eq("user_id", user.id)
        .maybeSingle();

      const newBalance = (creditRow?.credits_balance ?? 0) + creditsToGrant;
      await admin.from("user_credits").upsert({
        user_id: user.id,
        credits_balance: newBalance,
      }, { onConflict: "user_id" });

      await admin.from("subscribers").update({
        last_credit_grant_period: periodKey,
      }).eq("user_id", user.id);
    }

    return new Response(JSON.stringify({
      subscribed,
      tier,
      subscription_end: endDate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("check-subscription error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
