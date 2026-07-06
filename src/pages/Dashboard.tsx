import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { trackEvent } from "@/lib/analytics";
import ResultSection from "@/components/ResultSection";
import { ChevronDown, ChevronRight, Shield } from "lucide-react";

interface Optimization {
  id: string;
  created_at: string;
  input_bullet: string;
  input_jd: string;
  optimized_bullet: string;
  match_score: number;
  missing_keywords: string[];
  suggested_verbs: string[];
  alt_a: string;
  alt_b: string;
}

type AlignmentFilter = "all" | "high" | "moderate" | "weak";

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { isPro: subIsPro, hasOneTimeCredit } = useSubscription();
  const isPro = subIsPro || hasOneTimeCredit;
  const navigate = useNavigate();
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlignmentFilter>("all");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    trackEvent("dashboard_viewed", { auth_state: "signed_in", plan_tier: isPro ? "pro" : "free" });
    const fetch = async () => {
      const { data } = await supabase
        .from("optimizations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setOptimizations((data as Optimization[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const avgScore = useMemo(() => {
    if (optimizations.length === 0) return 0;
    return Math.round(optimizations.reduce((sum, o) => sum + o.match_score, 0) / optimizations.length);
  }, [optimizations]);

  const filtered = useMemo(() => {
    if (filter === "all") return optimizations;
    return optimizations.filter((o) => {
      if (filter === "high") return o.match_score >= 75;
      if (filter === "moderate") return o.match_score >= 60 && o.match_score < 75;
      return o.match_score < 60;
    });
  }, [optimizations, filter]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const filters: { value: AlignmentFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "high", label: "High" },
    { value: "moderate", label: "Moderate" },
    { value: "weak", label: "Needs Strengthening" },
  ];

  return (
    <div className="container max-w-5xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Your Alignments</h1>
          {isPro && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Shield className="h-3 w-3" /> Paid
            </span>
          )}
        </div>
        {optimizations.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Average Alignment: <span className="font-semibold text-foreground">{avgScore}%</span>
          </p>
        )}
      </div>

      {optimizations.length > 0 && (
        <div className="mb-4 flex gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {optimizations.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-muted-foreground">No alignments yet. Go align a bullet!</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-muted-foreground">No alignments match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((opt) => {
            const expanded = expandedId === opt.id;
            return (
              <div key={opt.id} className="rounded-lg border bg-card">
                <button
                  onClick={() => setExpandedId(expanded ? null : opt.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {opt.input_bullet}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(opt.created_at), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    opt.match_score >= 75
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : opt.match_score >= 60
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                  }`}>
                    {opt.match_score}%
                  </span>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t px-4 pb-4 pt-3">
                    <ResultSection title="Optimized Bullet" content={opt.optimized_bullet} />
                    <ResultSection title="Match Score" content={`${opt.match_score}%`} />
                    <ResultSection title="Missing Keywords" content={opt.missing_keywords} />
                    <ResultSection title="Suggested Action Verbs" content={opt.suggested_verbs} />
                    <ResultSection title="Alternate A — Impact-focused" content={opt.alt_a} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
