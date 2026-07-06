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
import { trackEvent } from "@/lib/analytics";
import ScoreEvidencePanel from "@/components/ScoreEvidencePanel";
import {
  SCORE_BREAKDOWN_DIMENSIONS,
  extractPrimaryBlocker,
  extractScoringBreakdown,
  parseScoreRationale,
  type ScoringBreakdown,
} from "@/lib/scoreEvidence";
import type { ScoringEvidence } from "@/lib/scoringEvidenceTypes";

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
interface BreakdownRow {
  label: string;
  weight: string;
  value: number;
}
interface ExpandedResult {
  optimized_bullet: string;
  match_score: string;
  missing_keywords: string;
  suggested_verbs: string;
  top_gap: string;
  primary_blocker: string | null;
  top_matched_signal: string | null;
  top_missing_signal: string | null;
  strengths: string[];
  gaps: string[];
  breakdown: BreakdownRow[];
  scoringBreakdown: ScoringBreakdown | null;
  scoring_evidence: ScoringEvidence | null;
}

const HISTORY_BREAKDOWN_LABELS = SCORE_BREAKDOWN_DIMENSIONS.map((d) => ({
  key: d.key as string,
  label: d.label,
  weight: d.weight,
}));

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
    let inferred_role = typeof raw.inferred_role === "string" ? raw.inferred_role : "";
    const top_gap = typeof raw.top_gap === "string" ? raw.top_gap : null;
    const resume_built = !!raw.resume_built;

    // Guard: reject entries whose "role" looks like raw resume text (>80 chars, newlines, or starts with a person's name pattern / resume bullet)
    if (inferred_role.length > 80 || inferred_role.includes("\n")) {
      inferred_role = "";
    }
    // If it looks like a resume header (name, email, bullet text), clear it
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+\s/.test(inferred_role) && !/(manager|lead|director|coordinator|supervisor|analyst|engineer|specialist|associate|officer)/i.test(inferred_role)) {
      inferred_role = "";
    }
    if (/^(managed|led|oversaw|coordinated|responsible|worked|developed|created|built)/i.test(inferred_role)) {
      inferred_role = "";
    }

    return { id, created_at, inferred_role: inferred_role || "Alignment Run", score, strength_label, top_gap, resume_built };
  } catch {
    return null;
  }
}

function parseStoredScoringEvidence(raw: unknown): ScoringEvidence | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const se = raw as Record<string, unknown>;
    if (!Array.isArray(se.matched_evidence) || !Array.isArray(se.missing_evidence)) return null;
    const conf = se.evidence_confidence;
    if (conf !== "high" && conf !== "medium" && conf !== "low") return null;
    return {
      matched_evidence: se.matched_evidence as ScoringEvidence["matched_evidence"],
      missing_evidence: se.missing_evidence as ScoringEvidence["missing_evidence"],
      pillar_evidence:
        se.pillar_evidence && typeof se.pillar_evidence === "object"
          ? (se.pillar_evidence as ScoringEvidence["pillar_evidence"])
          : {},
      evidence_confidence: conf,
    };
  } catch {
    return null;
  }
}

/** Extract ONLY the 5 required fields — everything else is discarded */
function safeParseExpandedResult(raw: any): ExpandedResult | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, any>;
    const UNAVAILABLE = "Detail unavailable";

    // 1. Optimized Bullet
    let optimized_bullet = UNAVAILABLE;
    try { if (typeof r.alt_a === "string" && r.alt_a.trim()) optimized_bullet = r.alt_a; } catch { /* */ }

    // 2. Match Score
    let match_score = UNAVAILABLE;
    try {
      if (typeof r.match_score === "number") match_score = `${r.match_score}%`;
      else if (r.signal_model?.match_score?.score != null) match_score = `${Number(r.signal_model.match_score.score)}%`;
    } catch { /* */ }

    // 3. Missing Keywords
    let missing_keywords = UNAVAILABLE;
    try {
      const mk = r.missing_keywords;
      if (Array.isArray(mk) && mk.length > 0) missing_keywords = mk.filter((k: any) => typeof k === "string").join(" · ");
      else if (typeof mk === "string" && mk.trim()) missing_keywords = mk;
    } catch { /* */ }

    // 4. Suggested Action Verbs
    let suggested_verbs = UNAVAILABLE;
    try {
      const sv = r.suggested_verbs ?? r.action_verbs;
      if (Array.isArray(sv) && sv.length > 0) suggested_verbs = sv.filter((v: any) => typeof v === "string").join(", ");
    } catch { /* */ }

    // 5. Top Gap
    let top_gap = UNAVAILABLE;
    try {
      if (typeof r.top_gap === "string" && r.top_gap.trim()) top_gap = r.top_gap;
      else if (typeof r.top_missing_signal === "string" && r.top_missing_signal.trim()) top_gap = r.top_missing_signal;
    } catch { /* */ }

    // 6. Primary blocker (evidence)
    const primary_blocker = extractPrimaryBlocker(r);

    // 6b. Top matched / missing signals
    let top_matched_signal: string | null = null;
    let top_missing_signal: string | null = null;
    try {
      if (typeof r.top_matched_signal === "string" && r.top_matched_signal.trim()) top_matched_signal = r.top_matched_signal;
      if (typeof r.top_missing_signal === "string" && r.top_missing_signal.trim()) top_missing_signal = r.top_missing_signal;
    } catch { /* */ }

    // 7. Strengths + gaps (from score_rationale)
    const { strengths, gaps } = parseScoreRationale(
      Array.isArray(r.score_rationale) ? (r.score_rationale as string[]) : undefined,
    );

    // 8. Scoring breakdown (5 weighted dimensions)
    const breakdown: BreakdownRow[] = [];
    let scoringBreakdown: ScoringBreakdown | null = null;
    try {
      const sb =
        extractScoringBreakdown(r.scoring_breakdown) ??
        extractScoringBreakdown(r.signal_model?.scoring_breakdown) ??
        extractScoringBreakdown(r.signal_model?.debug?.scoring_breakdown);
      scoringBreakdown = sb;
      if (sb) {
        for (const d of HISTORY_BREAKDOWN_LABELS) {
          const v = sb[d.key as keyof ScoringBreakdown];
          if (typeof v === "number" && isFinite(v)) {
            breakdown.push({ label: d.label, weight: d.weight, value: v });
          }
        }
      }
    } catch { /* */ }

    const scoring_evidence = parseStoredScoringEvidence(r.scoring_evidence);

    // Must have at least one real field
    if (optimized_bullet === UNAVAILABLE && match_score === UNAVAILABLE) return null;

    return {
      optimized_bullet,
      match_score,
      missing_keywords,
      suggested_verbs,
      top_gap,
      primary_blocker,
      top_matched_signal,
      top_missing_signal,
      strengths,
      gaps,
      breakdown,
      scoringBreakdown,
      scoring_evidence,
    };
  } catch {
    return null;
  }
}

/* ── label + color helpers ── */
const getStrengthLabel = (score: number): string => {
  if (score >= 70) return "Interview Range";
  if (score >= 60) return "Strong";
  if (score >= 40) return "Moderate";
  return "Low Signal";
};
const scoreColor = (s: number) =>
  s >= 70 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-amber-500" : s >= 40 ? "text-orange-500" : "text-destructive";
const scoreBadgeClasses = (s: number) =>
  s >= 70
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
    : s >= 60
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800"
      : s >= 40
        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800"
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

/* ── mock data for non-pro preview ── */
const MOCK_ENTRIES: HistoryEntry[] = [
  { id: "m1", created_at: new Date(Date.now() - 86400000 * 6).toISOString(), inferred_role: "Senior Product Manager", score: 82, strength_label: "Interview Range", top_gap: "Strategic planning signals", resume_built: true },
  { id: "m2", created_at: new Date(Date.now() - 86400000 * 5).toISOString(), inferred_role: "Senior Product Manager", score: 76, strength_label: "Interview Range", top_gap: "Stakeholder management depth", resume_built: false },
  { id: "m3", created_at: new Date(Date.now() - 86400000 * 4).toISOString(), inferred_role: "Marketing Director", score: 68, strength_label: "Strong", top_gap: "Revenue impact framing", resume_built: true },
  { id: "m4", created_at: new Date(Date.now() - 86400000 * 3).toISOString(), inferred_role: "Operations Lead", score: 54, strength_label: "Moderate", top_gap: "Process optimization evidence", resume_built: false },
  { id: "m5", created_at: new Date(Date.now() - 86400000 * 1).toISOString(), inferred_role: "Marketing Director", score: 71, strength_label: "Interview Range", top_gap: "Brand strategy signals", resume_built: true },
  { id: "m6", created_at: new Date().toISOString(), inferred_role: "Senior Product Manager", score: 88, strength_label: "Interview Range", top_gap: null, resume_built: true },
];

type FilterKey = "all" | "interview" | "strong" | "moderate" | "low";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "interview", label: "Interview Range" },
  { key: "strong", label: "Strong" },
  { key: "moderate", label: "Moderate" },
  { key: "low", label: "Low Signal" },
];
function filterMatch(score: number, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "interview") return score >= 70;
  if (filter === "strong") return score >= 60 && score < 70;
  if (filter === "moderate") return score >= 40 && score < 60;
  return score < 40;
}

/* ── expanded section component ── */
function ExpandedResultView({ result, isPro }: { result: ExpandedResult; isPro: boolean }) {
  const { toast } = useToast();
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", duration: 1500 });
  };

  try {
    const UNAVAILABLE = "Detail unavailable";
    const sections = [
      { label: "Optimized Bullet", content: result.optimized_bullet },
      { label: "Match Score", content: result.match_score },
      { label: "Missing Keywords", content: result.missing_keywords },
      { label: "Suggested Action Verbs", content: result.suggested_verbs },
      { label: "Top Gap", content: result.top_gap },
    ];

    const hasEvidence =
      !!result.primary_blocker ||
      result.strengths.length > 0 ||
      result.gaps.length > 0 ||
      result.breakdown.length > 0 ||
      !!result.top_matched_signal ||
      !!result.top_missing_signal;

    return (
      <div className="mt-2 space-y-2">
        {sections.map((s) => (
          <div key={s.label} className="rounded-lg border border-l-[3px] border-l-primary bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-xs leading-relaxed ${s.content === UNAVAILABLE ? "text-muted-foreground italic" : "text-foreground"}`}>{s.content}</p>
              </div>
              {s.content !== UNAVAILABLE && (
                <button onClick={() => copy(s.content)} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" title="Copy">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        ))}

        {hasEvidence && (
          <ScoreEvidencePanel
            title="Why this score"
            breakdown={result.scoringBreakdown}
            topMatchedSignal={result.top_matched_signal}
            topMissingSignal={result.top_missing_signal}
            primaryBlocker={result.primary_blocker}
            strengths={result.strengths}
            gaps={result.gaps.slice(1)}
            scoringEvidence={result.scoring_evidence}
            isPro={isPro}
            showRationale
            className="bg-card border-border/60"
          />
        )}
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
    if (!user) { setLoading(false); return; }
    trackEvent("history_viewed", { auth_state: "signed_in", plan_tier: isPro ? "pro" : "free" });
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
  }, [user, authLoading, isPro]);

  // Use mock data for non-pro users to show blurred preview
  const displayEntries = isPro ? entries : MOCK_ENTRIES;

  /* ── chart data with smart x-axis ── */
  const chartData = useMemo(() => {
    if (displayEntries.length === 0) return { data: [], sameDay: false };
    const reversed = [...displayEntries].reverse();
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
  }, [displayEntries]);

  /* ── groups ── */
  const groups = useMemo(() => {
    const filtered = filter === "all" ? displayEntries : displayEntries.filter((e) => filterMatch(e.score, filter));
    return groupEntries(filtered);
  }, [displayEntries, filter]);

  /* ── average ── */
  const avgScore = useMemo(() => {
    if (displayEntries.length === 0) return 0;
    return Math.round(displayEntries.reduce((s, e) => s + e.score, 0) / displayEntries.length);
  }, [displayEntries]);

  const handleViewResult = async (entry: HistoryEntry) => {
    if (expandedId === entry.id) { setExpandedId(null); setExpandedResult(null); return; }
    trackEvent("history_item_opened", { plan_tier: isPro ? "pro" : "free" });
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
      <div className="container max-w-5xl md:max-w-content py-20 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl md:max-w-content py-10 px-4">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="section-label">Alignment History</p>
          <p className="text-xs text-muted-foreground mt-1">Your signal trajectory over time</p>
        </div>
        {isPro && displayEntries.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-end gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Average Alignment
            </p>
            <p className={`text-lg font-bold tabular-nums text-primary`}>{avgScore}%</p>
          </div>
        )}
      </div>

      {/* Blurred preview wrapper for non-pro users */}
      <div className={`relative ${!isPro ? "min-h-[500px]" : ""}`}>
        {!isPro && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-sm px-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <span className="text-2xl text-primary">✦</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-foreground tracking-tight">Unlock Alignment History</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Track your signal trajectory over time, compare runs by role, and monitor your alignment progress.
                </p>
              </div>
              <Button onClick={() => setShowUpgrade(true)} className="gap-2" size="lg">
                <span style={{ color: "inherit" }}>✦</span>
                Unlock History — Active Job Search
              </Button>
            </div>
          </div>
        )}

        <div className={!isPro ? "blur-[6px] opacity-50 pointer-events-none select-none" : ""}>
          {/* Trend chart */}
          <div className="rounded-xl border bg-card p-4 mb-8">
            {displayEntries.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] md:h-[160px]">
                <p className="text-xs text-muted-foreground border-t-2 border-dashed border-muted-foreground/30 pt-3">
                  Your signal trajectory will appear here after your first alignment
                </p>
              </div>
            ) : displayEntries.length === 1 ? (
              <div className="text-center py-6">
                <span className={`text-3xl font-bold ${scoreColor(displayEntries[0].score)}`}>{displayEntries[0].score}%</span>
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
          {displayEntries.length > 0 && (
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
          <div className="space-y-[18px]">
        {groups.map((group) => {
          const isMulti = group.entries.length > 1;
          const isGroupExpanded = expandedGroupKey === group.key;
          const latest = group.latestEntry;

          return (
            <div key={group.key}>
              {/* Group header card */}
              <div className="rounded-lg border border-l-[3px] border-l-primary bg-card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{group.role || "Alignment Run"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(latest.created_at), "MMM d, yyyy · h:mm a")} · {getStrengthLabel(latest.score)}
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
                expandedResult ? <ExpandedResultView result={expandedResult} isPro={isPro} /> : (
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
                            {format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")} · {getStrengthLabel(entry.score)}
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
                        expandedResult ? <ExpandedResultView result={expandedResult} isPro={isPro} /> : (
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
        </div>{/* end blur wrapper */}
      </div>{/* end relative wrapper */}

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default History;
