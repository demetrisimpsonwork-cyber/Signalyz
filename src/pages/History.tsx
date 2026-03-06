import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { format, differenceInHours } from "date-fns";
import { Copy, ChevronDown, ChevronUp } from "lucide-react";
import UpgradeModal from "@/components/UpgradeModal";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";

/* ── types ── */
interface HistoryEntry {
  id: string;
  created_at: string;
  inferred_role: string;
  score: number;
  strength_label: string;
  top_gap: string | null;
  resume_built: boolean;
}

/** Only flat, renderable primitives — no nested objects touch the DOM */
interface ExpandedResult {
  alt_a?: string;
  alt_b?: string;
  match_score?: number;
  gaps?: string[];
  suggested_verbs?: string[];
  top_gap?: string;
}

interface HistoryGroup {
  key: string;
  role: string;
  entries: HistoryEntry[];
  latestEntry: HistoryEntry;
}

/* ── guards ── */
function safeParseEntry(raw: any): HistoryEntry | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" ? raw.id : String(raw.id ?? "");
    const created_at = typeof raw.created_at === "string" ? raw.created_at : "";
    const score = typeof raw.score === "number" ? raw.score : Number(raw.score ?? NaN);
    if (!id || !created_at || isNaN(score)) return null;
    const strength_label = typeof raw.strength_label === "string" ? raw.strength_label : "—";
    const inferred_role = typeof raw.inferred_role === "string" ? raw.inferred_role : "";
    const top_gap = typeof raw.top_gap === "string" ? raw.top_gap : null;
    const resume_built = !!raw.resume_built;
    // Reject entries whose "role" looks like raw resume text (>80 chars or contains newlines)
    if (inferred_role.length > 80 || inferred_role.includes("\n")) return null;
    return { id, created_at, inferred_role, score, strength_label, top_gap, resume_built };
  } catch {
    return null;
  }
}

/** Extract ONLY flat renderable fields — everything else is discarded */
function safeParseExpandedResult(raw: any): ExpandedResult | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, any>;

    // Extract match_score (top-level number or nested in signal_model)
    let matchScore: number | undefined;
    if (typeof r.match_score === "number") matchScore = r.match_score;
    else if (r.signal_model?.match_score?.score != null) matchScore = Number(r.signal_model.match_score.score);

    // Extract gaps from signal_model.gaps or top-level gaps
    let gaps: string[] | undefined;
    const rawGaps = r.signal_model?.gaps ?? r.gaps;
    if (Array.isArray(rawGaps)) gaps = rawGaps.filter((g: any) => typeof g === "string").slice(0, 5);

    // Extract suggested verbs
    let suggestedVerbs: string[] | undefined;
    const rawVerbs = r.suggested_verbs ?? r.action_verbs;
    if (Array.isArray(rawVerbs)) suggestedVerbs = rawVerbs.filter((v: any) => typeof v === "string");

    // Top gap
    const topGap = typeof r.top_gap === "string" ? r.top_gap : (gaps?.[0] ?? undefined);

    // Must have at least a score or a bullet to be worth rendering
    if (matchScore == null && typeof r.alt_a !== "string") return null;

    return {
      alt_a: typeof r.alt_a === "string" ? r.alt_a : undefined,
      alt_b: typeof r.alt_b === "string" ? r.alt_b : undefined,
      match_score: matchScore,
      gaps,
      suggested_verbs: suggestedVerbs,
      top_gap: topGap,
    };
  } catch {
    return null;
  }
}

/* ── color helpers ── */
const scoreColor = (s: number) =>
  s >= 75 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-amber-500" : "text-destructive";
const scoreBadgeClasses = (s: number) =>
  s >= 75
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
    : s >= 60
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800"
      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
const scoreDotColor = (s: number) => (s >= 75 ? "#22c55e" : s >= 60 ? "#f59e0b" : "#ef4444");

/* ── grouping helper ── */
function normalizeKey(role: string): string {
  return role.toLowerCase().replace(/\s+/g, " ").trim();
}

function groupEntries(entries: HistoryEntry[]): HistoryGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  const order: string[] = [];
  for (const e of entries) {
    const key = normalizeKey(e.inferred_role || "alignment-run");
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(e);
  }
  return order.map((key) => {
    const groupEntries = map.get(key)!;
    return {
      key,
      role: groupEntries[0].inferred_role || "Alignment Run",
      entries: groupEntries, // already sorted newest first from query
      latestEntry: groupEntries[0],
    };
  });
}

type FilterKey = "all" | "high" | "moderate" | "weak";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "moderate", label: "Moderate" },
  { key: "weak", label: "Needs Strengthening" },
];
function filterMatch(score: number, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "high") return score >= 75;
  if (filter === "moderate") return score >= 60 && score < 75;
  return score < 60;
}

/* ── expanded section component ── */
function ExpandedResultView({ result }: { result: ExpandedResult }) {
  const { toast } = useToast();
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", duration: 1500 });
  };

  try {
    const sections: { label: string; content: string }[] = [];

    // 1. Optimized Bullets
    if (result.alt_a) sections.push({ label: "Optimized Bullet", content: result.alt_a });
    if (result.alt_b) sections.push({ label: "Optimized Bullet — Variant B", content: result.alt_b });

    // 2. Top Gap callout
    if (result.top_gap) sections.push({ label: "Top Gap", content: result.top_gap });

    // 3. Gaps / Missing Keywords
    if (result.gaps?.length)
      sections.push({ label: "Signal Gaps", content: result.gaps.join(" · ") });

    // 4. Suggested Action Verbs
    if (result.suggested_verbs?.length)
      sections.push({ label: "Suggested Action Verbs", content: result.suggested_verbs.join(", ") });

    if (sections.length === 0 && result.match_score == null) {
      return (
        <div className="mt-2 rounded-lg border bg-muted/30 p-4 text-center">
          <p className="text-xs text-muted-foreground">Result unavailable — re-run alignment</p>
        </div>
      );
    }

    return (
      <div className="mt-2 space-y-2">
        {/* Match Score */}
        {result.match_score != null && (
          <div className="rounded-lg border border-l-[3px] border-l-primary bg-card p-3 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Match Score</span>
            <Badge className={`text-xs ${scoreBadgeClasses(result.match_score)}`}>{result.match_score}%</Badge>
          </div>
        )}

        {/* Sections — only flat strings, never objects */}
        {sections.map((s) => (
          <div key={s.label} className="rounded-lg border border-l-[3px] border-l-primary bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{s.label}</p>
                <p className="text-xs text-foreground leading-relaxed">{s.content}</p>
              </div>
              <button onClick={() => copy(s.content)} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" title="Copy">
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  } catch {
    return (
      <div className="mt-2 rounded-lg border bg-muted/30 p-4 text-center">
        <p className="text-xs text-muted-foreground">Detail unavailable</p>
      </div>
    );
  }
}

/* ── custom tooltip ── */
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  return (
    <div className="rounded-lg border bg-card p-2 shadow-md text-xs">
      <p className="font-medium text-foreground">{entry?.fullDate || label}</p>
      <p className={`font-bold ${scoreColor(payload[0].value)}`}>{payload[0].value}%</p>
    </div>
  );
}

/* ── main component ── */
const History = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isPro, loading: subLoading } = useSubscription();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<ExpandedResult | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    supabase
      .from("alignment_history")
      .select("id, created_at, inferred_role, score, strength_label, top_gap, resume_built")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const raw = (data || []) as any[];
        const parsed: HistoryEntry[] = [];
        let failed = 0;
        for (const item of raw) {
          const entry = safeParseEntry(item);
          if (entry) parsed.push(entry);
          else failed++;
        }
        setEntries(parsed);
        setFailedCount(failed);
        setLoading(false);
      });
  }, [user, authLoading]);

  /* ── chart data with smart x-axis ── */
  const chartData = useMemo(() => {
    if (entries.length === 0) return { data: [], sameDay: false };
    const reversed = [...entries].reverse();
    const first = new Date(reversed[0].created_at);
    const last = new Date(reversed[reversed.length - 1].created_at);
    const sameDay = differenceInHours(last, first) < 24;
    return {
      sameDay,
      data: reversed.map((e) => ({
        label: sameDay ? format(new Date(e.created_at), "h:mm a") : format(new Date(e.created_at), "MMM d"),
        fullDate: format(new Date(e.created_at), "MMM d, yyyy · h:mm a"),
        score: e.score,
        fill: scoreDotColor(e.score),
      })),
    };
  }, [entries]);

  /* ── groups ── */
  const groups = useMemo(() => {
    const filtered = filter === "all" ? entries : entries.filter((e) => filterMatch(e.score, filter));
    return groupEntries(filtered);
  }, [entries, filter]);

  /* ── average ── */
  const avgScore = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length);
  }, [entries]);

  const handleViewResult = async (entry: HistoryEntry) => {
    if (expandedId === entry.id) { setExpandedId(null); setExpandedResult(null); return; }
    const { data } = await supabase
      .from("alignment_history")
      .select("full_result_json")
      .eq("id", entry.id)
      .single();
    const parsed = safeParseExpandedResult(data?.full_result_json as Record<string, unknown>);
    setExpandedId(entry.id);
    setExpandedResult(parsed);
  };

  if (authLoading || loading || subLoading) {
    return (
      <div className="container max-w-3xl py-20 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-10 px-4">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Alignment History</p>
          <p className="text-xs text-muted-foreground mt-1">Your signal trajectory over time</p>
        </div>
        {entries.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-end gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Average Alignment
            </p>
            <p className={`text-lg font-bold tabular-nums text-primary`}>{avgScore}%</p>
          </div>
        )}
      </div>

      {/* Trend chart */}
      <div className="relative rounded-xl border bg-card p-4 mb-8">
        {!isPro && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
            <Button onClick={() => setShowUpgrade(true)}>Unlock History — Resumix Pro</Button>
          </div>
        )}
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] md:h-[160px]">
            <p className="text-xs text-muted-foreground border-t-2 border-dashed border-muted-foreground/30 pt-3">
              Your signal trajectory will appear here after your first alignment
            </p>
          </div>
        ) : entries.length === 1 ? (
          <div className="text-center py-6">
            <span className={`text-3xl font-bold ${scoreColor(entries[0].score)}`}>{entries[0].score}%</span>
            <p className="text-xs text-muted-foreground mt-2">Run another alignment to track your progress over time</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={typeof window !== "undefined" && window.innerWidth < 768 ? 120 : 160}>
            <LineChart data={chartData.data}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={30} />
              <RechartsTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-8 px-3 rounded-full text-xs font-medium transition-colors border ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Grouped cards */}
      <div className={`space-y-[18px] relative ${!isPro ? "blur-sm pointer-events-none select-none" : ""}`}>
        {groups.map((group) => {
          const isMulti = group.entries.length > 1;
          const isGroupExpanded = expandedGroupKey === group.key;
          const latest = group.latestEntry;

          return (
            <div key={group.key}>
              {/* Group header card */}
              <div className="rounded-lg border border-l-[3px] border-l-primary bg-card p-5 md:p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{group.role || "Alignment Run"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(latest.created_at), "MMM d, yyyy · h:mm a")} · {latest.strength_label}
                    </p>
                    {latest.top_gap && <p className="text-xs text-muted-foreground truncate mt-0.5">Top gap: {latest.top_gap}</p>}
                    {isMulti && (
                      <p className="text-[10px] text-muted-foreground mt-1">{group.entries.length} runs</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={`text-base font-bold tabular-nums px-2.5 py-1 ${scoreBadgeClasses(latest.score)}`}>
                      {latest.score}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMulti && (
                      <button
                        onClick={() => setExpandedGroupKey(isGroupExpanded ? null : group.key)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={isGroupExpanded ? "Collapse" : "Expand runs"}
                      >
                        {isGroupExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    )}
                    {!isMulti && (
                      <Button variant="outline" size="sm" onClick={() => handleViewResult(latest)} className="text-xs">
                        {expandedId === latest.id ? "Hide" : "View"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Single entry expanded result */}
              {!isMulti && expandedId === latest.id && (
                expandedResult ? <ExpandedResultView result={expandedResult} /> : (
                  <div className="mt-2 rounded-lg border bg-muted/30 p-4 text-center">
                    <p className="text-xs text-muted-foreground">Result unavailable — re-run alignment</p>
                  </div>
                )
              )}

              {/* Multi-entry sub-rows */}
              {isMulti && isGroupExpanded && (
                <div className="mt-2 space-y-2 pl-3 border-l-2 border-muted ml-2">
                  {group.entries.map((entry) => (
                    <div key={entry.id}>
                      <div className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")} · {entry.strength_label}
                          </p>
                          {entry.top_gap && <p className="text-[10px] text-muted-foreground truncate mt-0.5">Top gap: {entry.top_gap}</p>}
                        </div>
                        <Badge className={`text-xs font-bold tabular-nums ${scoreBadgeClasses(entry.score)}`}>
                          {entry.score}%
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => handleViewResult(entry)} className="text-xs shrink-0">
                          {expandedId === entry.id ? "Hide" : "View"}
                        </Button>
                      </div>
                      {expandedId === entry.id && (
                        expandedResult ? <ExpandedResultView result={expandedResult} /> : (
                          <div className="mt-2 rounded-lg border bg-muted/30 p-4 text-center">
                            <p className="text-xs text-muted-foreground">Result unavailable — re-run alignment</p>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {failedCount > 0 && (
          <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {failedCount} result{failedCount > 1 ? "s" : ""} couldn't be displayed
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Re-run alignment
            </Button>
          </div>
        )}

        {groups.length === 0 && entries.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">No results match this filter</p>
          </div>
        )}
      </div>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default History;
