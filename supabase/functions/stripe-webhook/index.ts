import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "No signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only process one-time credit purchases
      if (session.mode !== "payment" || session.payment_status !== "paid") {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = session.metadata?.user_id;
      const packageKey = session.metadata?.package_key;
      const credits = parseInt(session.metadata?.credits || "0", 10);

      if (!userId || !packageKey || !credits) {
        console.error("Missing metadata on session", session.id);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dedupe: insert purchase record; if session already exists, skip granting
      const { error: insertError } = await admin.from("credit_purchases").insert({
        user_id: userId,
        stripe_session_id: session.id,
        stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
        package_key: packageKey,
        credits_granted: credits,
        amount_cents: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        status: "completed",
      });

      if (insertError) {
        // Unique violation = already processed
        if (insertError.code === "23505") {
          console.log("Session already processed:", session.id);
          return new Response(JSON.stringify({ received: true, deduped: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw insertError;
      }

      // Grant credits atomically
      const { data: existing } = await admin
        .from("user_credits")
        .select("credits_balance")
        .eq("user_id", userId)
        .maybeSingle();

      const newBalance = (existing?.credits_balance ?? 0) + credits;
      const { error: updateError } = await admin
        .from("user_credits")
        .upsert({ user_id: userId, credits_balance: newBalance }, { onConflict: "user_id" });

      if (updateError) throw updateError;

      console.log(`Granted ${credits} credits to user ${userId} (new balance: ${newBalance})`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Webhook processing error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
