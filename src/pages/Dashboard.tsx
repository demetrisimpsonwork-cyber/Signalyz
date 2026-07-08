import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight, Shield, Sparkles, Target, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  computeAverageScore,
  computeReadyVsRework,
  getMostRepeatedBlocker,
  getRecentHighPotentialRuns,
  getRecommendedNextAction,
  getStrengthLabel,
  getStrongestRole,
  parseAlignmentHistoryEntry,
  type AlignmentInsightEntry,
} from "@/lib/alignmentInsights";

function scoreBadgeClasses(score: number): string {
  if (score >= 70) {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
  if (score >= 60) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  }
  if (score >= 40) {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  }
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      {detail && <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>}
    </div>
  );
}

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { isPro: subIsPro, hasOneTimeCredit } = useSubscription();
  const isPro = subIsPro || hasOneTimeCredit;
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AlignmentInsightEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    trackEvent("dashboard_viewed", { auth_state: "signed_in", plan_tier: isPro ? "pro" : "free" });
    supabase
      .from("alignment_history")
      .select("id, created_at, inferred_role, score, strength_label, top_gap")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const parsed: AlignmentInsightEntry[] = [];
        for (const row of data ?? []) {
          const entry = parseAlignmentHistoryEntry(row);
          if (entry) parsed.push(entry);
        }
        setEntries(parsed);
        setLoading(false);
      });
  }, [user, isPro]);

  const latestRun = entries[0] ?? null;
  const avgScore = useMemo(() => computeAverageScore(entries), [entries]);
  const readyVsRework = useMemo(() => computeReadyVsRework(entries), [entries]);
  const strongestRole = useMemo(() => getStrongestRole(entries), [entries]);
  const repeatedBlocker = useMemo(() => getMostRepeatedBlocker(entries), [entries]);
  const highPotentialRuns = useMemo(() => getRecentHighPotentialRuns(entries), [entries]);
  const recommendedAction = useMemo(
    () => getRecommendedNextAction(entries, strongestRole, repeatedBlocker),
    [entries, strongestRole, repeatedBlocker],
  );

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-10 px-4">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            {isPro && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Shield className="h-3 w-3" /> Paid
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Your alignment command center.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-2">
            <Link to="/?tab=alignment">
              <Sparkles className="h-4 w-4" />
              New Analysis
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/history">View Full History</Link>
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center space-y-4">
          <p className="text-muted-foreground">No alignment runs yet.</p>
          <p className="text-sm text-foreground font-medium">{recommendedAction.message}</p>
          <Button asChild>
            <Link to="/?tab=alignment">New Analysis</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-l-[3px] border-l-primary bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Recommended next action</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{recommendedAction.message}</p>
            {repeatedBlocker && recommendedAction.message.includes("repeated blocker") && (
              <p className="text-xs text-muted-foreground">
                Most repeated blocker: <span className="text-foreground font-medium">{repeatedBlocker.blocker}</span>
                {repeatedBlocker.count > 1 ? ` (${repeatedBlocker.count} runs)` : ""}
              </p>
            )}
            {recommendedAction.ctaLabel && recommendedAction.ctaHref && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to={recommendedAction.ctaHref}>
                  {recommendedAction.ctaLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Average alignment"
              value={`${avgScore}%`}
              detail={`Across ${entries.length} run${entries.length === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Ready to apply"
              value={String(readyVsRework.ready)}
              detail="Interview Range (70%+)"
            />
            <StatCard
              label="Needs rework"
              value={String(readyVsRework.needsRework)}
              detail="Below interview-ready threshold"
            />
            <StatCard
              label="Strongest role"
              value={strongestRole ? `${strongestRole.avgScore}%` : "—"}
              detail={
                strongestRole
                  ? `${strongestRole.role} · ${strongestRole.runCount} run${strongestRole.runCount === 1 ? "" : "s"}`
                  : "Run more alignments"
              }
            />
          </div>

          {latestRun && (
            <div className="rounded-xl border bg-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Current status
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{latestRun.inferred_role}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(latestRun.created_at), "MMM d, yyyy · h:mm a")} ·{" "}
                    {latestRun.strength_label || getStrengthLabel(latestRun.score)}
                  </p>
                  {latestRun.top_gap && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">Top gap: {latestRun.top_gap}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${scoreBadgeClasses(latestRun.score)}`}
                >
                  {latestRun.score}%
                </span>
              </div>
            </div>
          )}

          {repeatedBlocker && (
            <div className="rounded-xl border bg-card p-5 flex items-start gap-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Most repeated blocker</p>
                <p className="text-sm text-muted-foreground mt-1">{repeatedBlocker.blocker}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Appeared in {repeatedBlocker.count} run{repeatedBlocker.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          )}

          {highPotentialRuns.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Recent high-potential runs</p>
                <Link to="/history" className="text-xs text-primary hover:underline">
                  View in History
                </Link>
              </div>
              <div className="space-y-2">
                {highPotentialRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-lg border bg-card p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{run.inferred_role}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(run.created_at), "MMM d, yyyy")} · Interview Range
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${scoreBadgeClasses(run.score)}`}
                    >
                      {run.score}%
                    </span>
                    <Button asChild variant="outline" size="sm" className="text-xs shrink-0">
                      <Link to="/history">View</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
