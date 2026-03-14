import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const userEmail = user.email;

    const { successUrl, cancelUrl, mode } = await req.json();
    const isOneTime = mode === "one_time";

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if customer already exists
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        console.log("Stored customer not found in current Stripe mode — will re-create");
        customerId = undefined;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      await adminSupabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
    }

    if (isOneTime) {
      // One-time $9 purchase — use the fixed price ID
      const oneTimePriceId = "price_1T9bVKIVDdqGTZ8BHvEvEBiv";

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: oneTimePriceId, quantity: 1 }],
        mode: "payment",
        success_url: successUrl || "https://signalyz.app/?purchase=success",
        cancel_url: cancelUrl || "https://signalyz.app/?purchase=cancelled",
        metadata: { user_id: userId, purchase_type: "one_time_diagnostic" },
      });

      return new Response(
        JSON.stringify({ url: checkoutSession.url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Subscription flow (existing)
    let priceId: string | undefined = Deno.env.get("STRIPE_PINNACLE_PRICE_ID") || undefined;

    if (priceId) {
      try {
        await stripe.prices.retrieve(priceId);
      } catch {
        console.log("Configured STRIPE_PINNACLE_PRICE_ID not found — will auto-create");
        priceId = undefined;
      }
    }

    if (!priceId) {
      console.log("Auto-creating Signalyz Pro product…");
      const product = await stripe.products.create({ name: "Signalyz Pro" });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 1900,
        currency: "usd",
        recurring: { interval: "month" },
      });
      priceId = price.id;
      console.log("Auto-created test price:", priceId);
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl || "https://resumix.app/?upgrade=success",
      cancel_url: cancelUrl || "https://resumix.app/?upgrade=cancelled",
      metadata: { user_id: userId },
      subscription_data: {
        metadata: { user_id: userId },
      },
      allow_promotion_codes: true,
    });

    return new Response(
      JSON.stringify({ url: checkoutSession.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(
      JSON.stringify({ error: "Checkout failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
