import { supabase } from "@/integrations/supabase/client";

export async function initiateCheckout(mode: "subscription" | "one_time" = "subscription") {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.warn("[Checkout] No session — redirecting to auth");
    window.location.href = "/auth?redirect=upgrade";
    return;
  }

  const isOneTime = mode === "one_time";
  const successParam = isOneTime ? "purchase=success" : "upgrade=success";
  const cancelParam = isOneTime ? "purchase=cancelled" : "upgrade=cancelled";

  try {
    console.log("[Checkout] Invoking create-checkout edge function… mode:", mode);
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        mode: isOneTime ? "one_time" : "subscription",
        successUrl: `${window.location.origin}/?${successParam}`,
        cancelUrl: `${window.location.origin}/?${cancelParam}`,
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
