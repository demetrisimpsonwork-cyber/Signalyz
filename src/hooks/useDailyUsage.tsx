import { useState, useEffect, useCallback } from "react";

const DAILY_FREE_LIMIT = 3;
const STORAGE_KEY = "resumix_daily_usage";

interface DailyUsage {
  date: string;
  count: number;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStoredUsage(): DailyUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyUsage;
      if (parsed.date === getToday()) return parsed;
    }
  } catch {}
  return { date: getToday(), count: 0 };
}

function saveUsage(usage: DailyUsage) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export function useDailyUsage(isPro: boolean) {
  const [usage, setUsage] = useState<DailyUsage>(getStoredUsage);

  const remaining = Math.max(0, DAILY_FREE_LIMIT - usage.count);
  const limitReached = !isPro && remaining <= 0;

  const increment = useCallback(() => {
    setUsage((prev) => {
      const today = getToday();
      const next = prev.date === today
        ? { date: today, count: prev.count + 1 }
        : { date: today, count: 1 };
      saveUsage(next);
      return next;
    });
  }, []);

  // Sync across tabs
  useEffect(() => {
    const handler = () => setUsage(getStoredUsage());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { remaining, limitReached, increment, DAILY_FREE_LIMIT };
}
