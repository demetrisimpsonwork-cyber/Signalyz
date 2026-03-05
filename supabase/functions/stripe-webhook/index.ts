import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";

serve(async (req) => {
  try {
    console.log("[Webhook] Handler invoked, method:", req.method);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    console.log("[Webhook] STRIPE_SECRET_KEY present:", !!stripeKey, "STRIPE_WEBHOOK_SECRET present:", !!webhookSecret);

    if (!stripeKey || !webhookSecret) {
      console.error("[Webhook] Missing secrets — stripeKey:", !!stripeKey, "webhookSecret:", !!webhookSecret);
      return new Response("Not configured", { status: 500 });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("[Webhook] Missing stripe-signature header");
      return new Response("Missing signature", { status: 400 });
    }

    const body = await req.text();
    console.log("[Webhook] Body length:", body.length, "Signature prefix:", signature.substring(0, 20));

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      console.log("[Webhook] Signature verified — event type:", event.type, "event id:", event.id);
    } catch (err) {
      console.error("[Webhook] Signature verification FAILED:", (err as Error).message);
      return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Idempotency check
    const { data: existing } = await supabase
      .from("subscription_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing) {
      console.log("[Webhook] Duplicate event, skipping:", event.id);
      return new Response(JSON.stringify({ received: true, skipped: "duplicate" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription as string | null;

        console.log("[Webhook] checkout.session.completed — user_id:", userId, "subscription:", subscriptionId, "customer:", session.customer);

        if (userId) {
          let periodEnd: string | null = null;

          if (subscriptionId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              periodEnd = new Date(sub.current_period_end * 1000).toISOString();
              console.log("[Webhook] Retrieved subscription period_end:", periodEnd, "status:", sub.status);
            } catch (subErr) {
              console.error("[Webhook] Failed to retrieve subscription from Stripe:", subErr);
            }
          }

          const updatePayload: Record<string, any> = {
            subscription_tier: "pro",
            subscription_status: "active",
            subscription_id: subscriptionId,
            subscription_period_end: periodEnd,
          };
          console.log("[Webhook] UPDATE profiles SET", JSON.stringify(updatePayload), "WHERE user_id =", userId);

          const { data: updateData, error: updateError, count, status, statusText } = await supabase
            .from("profiles")
            .update(updatePayload)
            .eq("user_id", userId)
            .select();

          console.log("[Webhook] Supabase response — status:", status, statusText, "data:", JSON.stringify(updateData), "error:", JSON.stringify(updateError), "count:", count);

          if (updateError) {
            console.error("[Webhook] Profile update FAILED:", updateError.message, updateError.details, updateError.hint);
          } else if (!updateData || updateData.length === 0) {
            console.error("[Webhook] Profile update returned NO rows — user_id may not exist in profiles:", userId);
          } else {
            console.log("[Webhook] Profile update SUCCESS:", JSON.stringify(updateData[0]));
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

    console.log("[Webhook] Done processing event:", event.type);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (topLevelErr) {
    console.error("[Webhook] TOP-LEVEL CRASH:", (topLevelErr as Error).message, (topLevelErr as Error).stack);
    return new Response(JSON.stringify({ error: (topLevelErr as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
