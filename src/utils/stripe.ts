import { supabase } from "@/integrations/supabase/client";

export async function initiateCheckout() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "/auth?redirect=upgrade";
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        successUrl: `${window.location.origin}/?upgrade=success`,
        cancelUrl: `${window.location.origin}/?upgrade=cancelled`,
      },
    });

    if (error) {
      return;
    }

    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (err) {
    // Checkout error handled silently
  }
}
