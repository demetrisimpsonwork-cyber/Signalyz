import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";

serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    return new Response("Not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Idempotency check: skip if this event was already processed
  const { data: existing } = await supabase
    .from("subscription_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ received: true, skipped: "duplicate" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  switch (event.type) {
    // Payment succeeded = upgrade to Pro
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;

      console.log("[Webhook] checkout.session.completed — metadata.user_id:", userId, "customer:", session.customer, "subscription:", session.subscription, "customer_email:", session.customer_email);

      if (userId) {
        const updatePayload = {
          subscription_tier: "pro",
          subscription_id: session.subscription as string,
          subscription_status: "active",
        };
        console.log("[Webhook] Writing to profiles for user_id:", userId, "payload:", JSON.stringify(updatePayload));

        const { error: updateError } = await supabase
          .from("profiles")
          .update(updatePayload)
          .eq("user_id", userId);

        if (updateError) {
          console.error("[Webhook] Profile update FAILED:", updateError.message);
        } else {
          console.log("[Webhook] Profile update SUCCESS for user_id:", userId);
        }

        await supabase.from("subscription_events").insert({
          user_id: userId,
          event_type: "checkout.completed",
          stripe_event_id: event.id,
          payload: session as any,
        });
      } else {
        console.warn("[Webhook] checkout.session.completed but NO user_id in metadata! Session ID:", session.id);
      }
      break;
    }

    // Recurring payment succeeded
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string;

      if (subId) {
        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = subscription.metadata?.user_id;

        if (userId) {
          await supabase
            .from("profiles")
            .update({
              subscription_status: "active",
              subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq("user_id", userId);

          await supabase.from("subscription_events").insert({
            user_id: userId,
            event_type: "invoice.payment_succeeded",
            stripe_event_id: event.id,
            payload: { invoice_id: invoice.id, subscription_id: subId } as any,
          });
        }
      }
      break;
    }

    // Payment failed
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string;

      if (subId) {
        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = subscription.metadata?.user_id;

        if (userId) {
          await supabase
            .from("profiles")
            .update({ subscription_status: "past_due" })
            .eq("user_id", userId);

          await supabase.from("subscription_events").insert({
            user_id: userId,
            event_type: "invoice.payment_failed",
            stripe_event_id: event.id,
            payload: { invoice_id: invoice.id } as any,
          });
        }
      }
      break;
    }

    // Subscription cancelled
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;

      if (userId) {
        await supabase
          .from("profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "cancelled",
            subscription_id: null,
          })
          .eq("user_id", userId);

        await supabase.from("subscription_events").insert({
          user_id: userId,
          event_type: "subscription.deleted",
          stripe_event_id: event.id,
          payload: { subscription_id: subscription.id } as any,
        });
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
