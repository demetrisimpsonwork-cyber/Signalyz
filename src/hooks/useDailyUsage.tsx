import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const DAILY_FREE_LIMIT = 3;

function getSessionToken(): string {
  const key = "signalyz_session_token";
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

export function useDailyUsage(isPro: boolean) {
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const remaining = Math.max(0, DAILY_FREE_LIMIT - count);
  const limitReached = !isPro && remaining <= 0;

  // Fetch actual usage from server
  const fetchUsage = useCallback(async () => {
    if (isPro) { setLoaded(true); return; }

    const today = new Date().toISOString().slice(0, 10);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    try {
      if (userId) {
        const { data } = await supabase
          .from("usage_tracking")
          .select("alignment_count")
          .eq("user_id", userId)
          .eq("usage_date", today)
          .maybeSingle();
        setCount(data?.alignment_count ?? 0);
      } else {
        // Guest: use session token — query via edge function or just rely on server enforcement
        // We can't query usage_tracking directly without auth (RLS), so use local fallback
        const key = "resumix_daily_usage";
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.date === today) {
              setCount(parsed.count ?? 0);
            } else {
              setCount(0);
            }
          }
        } catch { setCount(0); }
      }
    } catch {
      // Fallback to 0 on error
      setCount(0);
    }
    setLoaded(true);
  }, [isPro]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const increment = useCallback(() => {
    setCount((prev) => {
      const next = prev + 1;
      // For guests, also update localStorage for UI display
      const today = new Date().toISOString().slice(0, 10);
      try {
        localStorage.setItem("resumix_daily_usage", JSON.stringify({ date: today, count: next }));
      } catch {}
      return next;
    });
  }, []);

  return { remaining, limitReached, increment, DAILY_FREE_LIMIT, loaded };
}
