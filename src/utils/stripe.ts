import { supabase } from "@/integrations/supabase/client";

export async function initiateCheckout() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.warn("[Checkout] No session — redirecting to auth");
    window.location.href = "/auth?redirect=upgrade";
    return;
  }

  try {
    console.log("[Checkout] Invoking create-checkout edge function…");
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        successUrl: `${window.location.origin}/?upgrade=success`,
        cancelUrl: `${window.location.origin}/?upgrade=cancelled`,
      },
    });

    if (error) {
      console.error("[Checkout] Edge function error:", error);
      return;
    }

    console.log("[Checkout] Response:", data);

    if (data?.url) {
      window.location.href = data.url;
    } else {
      console.error("[Checkout] No URL returned from edge function", data);
    }
  } catch (err) {
    console.error("[Checkout] Exception:", err);
  }
}
