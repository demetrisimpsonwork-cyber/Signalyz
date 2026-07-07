import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { trackEvent, trackReliabilityError } from "@/lib/analytics";
import { authUrlForUpgradeIntent } from "@/lib/upgradeIntent";

export async function initiateCheckout(mode: "subscription" | "one_time" = "subscription") {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.warn("[Checkout] No session — redirecting to auth");
    const intent = mode === "one_time" ? "one_time" : "subscription";
    window.location.href = authUrlForUpgradeIntent(intent);
    return;
  }

  const isOneTime = mode === "one_time";
  const successParam = isOneTime ? "purchase=success" : "upgrade=success";
  const cancelParam = isOneTime ? "purchase=cancelled" : "upgrade=cancelled";

  try {
    trackEvent("checkout_started", { payment_mode: mode });
    trackEvent("begin_checkout", { payment_mode: mode });
    trackEvent("payment_started", { payment_mode: mode });
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
      trackEvent("checkout_failed", { payment_mode: mode, error_code: "EDGE_ERROR", success: false });
      toast({
        title: "Checkout unavailable",
        description: "We couldn't start checkout right now. Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    if (data?.error) {
      console.error("[Checkout] Stripe error:", data.error, "type:", data.type, "status:", data.statusCode);
      trackEvent("checkout_failed", {
        payment_mode: mode,
        error_code: String(data.type || data.statusCode || "STRIPE_ERROR"),
        success: false,
      });
      toast({
        title: "Checkout unavailable",
        description: "We couldn't start checkout right now. Please try again, or contact support@signalyz.ai if it continues.",
        variant: "destructive",
      });
      return;
    }

    console.log("[Checkout] Response:", data);

    if (data?.url) {
      trackEvent("checkout_redirected", { payment_mode: mode, success: true });
      window.location.href = data.url;
    } else {
      console.error("[Checkout] No URL returned from edge function", data);
      trackEvent("checkout_failed", { payment_mode: mode, error_code: "NO_CHECKOUT_URL", success: false });
      toast({
        title: "Checkout unavailable",
        description: "We couldn't start the checkout process. Please try again in a moment.",
        variant: "destructive",
      });
    }
  } catch (err) {
    console.error("[Checkout] Exception:", err);
    trackEvent("checkout_failed", { payment_mode: mode, error_code: "EXCEPTION", success: false });
    trackReliabilityError("unexpected_error", "CHECKOUT_EXCEPTION", { payment_mode: mode });
    toast({
      title: "Checkout unavailable",
      description: "Something went wrong. Please try again.",
      variant: "destructive",
    });
  }
}
