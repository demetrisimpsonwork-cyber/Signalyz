import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RawProfileData {
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  subscription_period_end: string | null;
  stripe_customer_id: string | null;
}

const SubscriptionDebugPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rawProfile, setRawProfile] = useState<RawProfileData | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [cacheData, setCacheData] = useState<any>(null);

  const fetchDirect = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_tier, subscription_status, subscription_id, subscription_period_end, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    setRawProfile(data as RawProfileData | null);
    setRawError(error?.message ?? null);
    setCacheData(queryClient.getQueryData(["subscription-status"]));
    setLastRefresh(new Date().toISOString());
  };

  useEffect(() => {
    if (user && open) fetchDirect();
  }, [user, open]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
    await fetchDirect();
  };

  if (!user) return null;

  // Only show in dev/preview
  const isDev = window.location.hostname.includes("lovable.app") || window.location.hostname === "localhost";
  if (!isDev) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-mono bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
      >
        <Bug className="h-3 w-3" />
        Sub Debug
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-96 rounded-lg border border-amber-500/30 bg-card shadow-xl p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Subscription Debug</span>
            <Button size="sm" variant="ghost" onClick={handleRefresh} className="h-6 px-2">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-1 text-[11px] font-mono">
            <Row label="user_id" value={user.id} />
            <Row label="email" value={user.email ?? "—"} />
            <div className="border-t border-border/30 my-1.5" />

            <span className="text-[9px] font-bold text-amber-400 uppercase">Raw DB Query (profiles)</span>
            {rawError ? (
              <div className="text-destructive text-[10px]">Error: {rawError}</div>
            ) : rawProfile ? (
              <>
                <Row label="subscription_tier" value={rawProfile.subscription_tier ?? "null"} highlight={rawProfile.subscription_tier !== "pro"} />
                <Row label="subscription_status" value={rawProfile.subscription_status ?? "null"} />
                <Row label="subscription_id" value={rawProfile.subscription_id ?? "null"} />
                <Row label="stripe_customer_id" value={rawProfile.stripe_customer_id ?? "null"} />
                <Row label="period_end" value={rawProfile.subscription_period_end ?? "null"} />
              </>
            ) : (
              <div className="text-muted-foreground text-[10px]">No profile found</div>
            )}

            <div className="border-t border-border/30 my-1.5" />
            <span className="text-[9px] font-bold text-amber-400 uppercase">React Query Cache</span>
            {cacheData ? (
              <pre className="text-[9px] bg-muted/30 p-1.5 rounded whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {JSON.stringify(cacheData, null, 2)}
              </pre>
            ) : (
              <div className="text-muted-foreground text-[10px]">Cache empty or not yet populated</div>
            )}

            <div className="border-t border-border/30 my-1.5" />
            <Row label="Last refresh" value={lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "—"} />
          </div>
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className={`text-right truncate ${highlight ? "text-amber-400 font-bold" : "text-foreground"}`}>{value}</span>
  </div>
);

export default SubscriptionDebugPanel;
