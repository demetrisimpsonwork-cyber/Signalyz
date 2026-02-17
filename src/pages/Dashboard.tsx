import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import ResultSection from "@/components/ResultSection";
import { ChevronDown, ChevronRight } from "lucide-react";

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

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
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

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Your optimizations</h1>

      {optimizations.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-muted-foreground">No optimizations yet. Go optimize a bullet!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {optimizations.map((opt) => {
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
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                    {opt.match_score}%
                  </span>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t px-4 pb-4 pt-3">
                    <ResultSection title="Optimized Bullet" content={opt.optimized_bullet} />
                    <ResultSection title="Match Score" content={`${opt.match_score}%`} />
                    <ResultSection title="Missing Keywords" content={opt.missing_keywords} />
                    <ResultSection title="Suggested Action Verbs" content={opt.suggested_verbs} />
                    <ResultSection title="Alternate A — Metric-focused" content={opt.alt_a} />
                    <ResultSection title="Alternate B — Human-natural" content={opt.alt_b} />
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
