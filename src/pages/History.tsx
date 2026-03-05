import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { format } from "date-fns";
import UpgradeModal from "@/components/UpgradeModal";
import { useSubscription } from "@/hooks/useSubscription";

interface HistoryEntry {
  id: string;
  created_at: string;
  inferred_role: string;
  score: number;
  strength_label: string;
  top_gap: string | null;
  resume_built: boolean;
}

const scoreColor = (s: number) => s >= 70 ? "text-green-600 dark:text-green-400" : s >= 50 ? "text-orange-500" : "text-destructive";
const scoreDotColor = (s: number) => s >= 70 ? "#22c55e" : s >= 50 ? "#f97316" : "#ef4444";

const History = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isPro, loading: subLoading } = useSubscription();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    supabase
      .from("alignment_history")
      .select("id, created_at, inferred_role, score, strength_label, top_gap, resume_built")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEntries((data as HistoryEntry[]) || []);
        setLoading(false);
      });
  }, [user, authLoading]);

  const chartData = [...entries].reverse().map((e) => ({
    date: format(new Date(e.created_at), "MMM d"),
    score: e.score,
    fill: scoreDotColor(e.score),
  }));

  const handleViewResult = async (entry: HistoryEntry) => {
    if (expandedId === entry.id) { setExpandedId(null); setExpandedResult(null); return; }
    const { data } = await supabase
      .from("alignment_history")
      .select("full_result_json")
      .eq("id", entry.id)
      .single();
    setExpandedId(entry.id);
    setExpandedResult(data?.full_result_json as Record<string, unknown> || null);
  };

  if (authLoading || loading || subLoading) {
    return <div className="container max-w-3xl py-20 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="container max-w-3xl py-10 px-4">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground" style={{ letterSpacing: "0.15em" }}>Alignment History</p>
        <p className="text-xs text-muted-foreground mt-1">Your signal trajectory over time</p>
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
          <ResponsiveContainer width="100%" height={window.innerWidth < 768 ? 120 : 160}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cards */}
      <div className={`space-y-4 relative ${!isPro ? "blur-sm pointer-events-none select-none" : ""}`}>
        {entries.map((entry) => (
          <div key={entry.id}>
            <div className="rounded-lg border bg-card p-5 md:p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{format(new Date(entry.created_at), "MMM d · h:mm a")}</p>
                <p className="text-sm font-medium text-foreground truncate">{entry.inferred_role || "Alignment Run"}</p>
                {entry.top_gap && <p className="text-xs text-muted-foreground truncate mt-0.5">Top gap: {entry.top_gap}</p>}
              </div>
              <div className="text-right shrink-0">
                <span className={`text-2xl font-bold tabular-nums ${scoreColor(entry.score)}`}>{entry.score}%</span>
                <p className="text-[10px] text-muted-foreground">{entry.strength_label}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleViewResult(entry)} className="shrink-0 text-xs">
                {expandedId === entry.id ? "Hide" : "View Result"}
              </Button>
            </div>
            {expandedId === entry.id && expandedResult && (
              <div className="mt-2 rounded-lg border bg-muted/30 p-4">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-96">
                  {JSON.stringify(expandedResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
      {!isPro && entries.length > 0 && (
        <div className="absolute inset-0" /> // overlay handled by blur above
      )}

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default History;
