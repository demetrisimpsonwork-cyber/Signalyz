import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface QAResult {
  name: string;
  run_id: string | null;
  total_score: number | null;
  top_3_gaps: string[];
  replay: boolean;
  status: string;
}

const DirectorQARunner = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QAResult[]>([]);

  const runQA = async () => {
    setLoading(true);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("director-calibration", {
        body: { qa_mode: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data.qa_results ?? []);
      toast.success(`QA complete: ${data.qa_results?.length ?? 0} fixtures run`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "QA run failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 pt-3.5 pb-2.5 border-b border-border/60 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
          Pipeline QA
        </p>
        <Button size="sm" variant="outline" onClick={runQA} disabled={loading} className="h-7 text-xs gap-1.5">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
          {loading ? "Running…" : "Run QA"}
        </Button>
      </div>

      {results.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">Fixture</TableHead>
              <TableHead className="text-[10px] uppercase">Run ID</TableHead>
              <TableHead className="text-[10px] uppercase">Score</TableHead>
              <TableHead className="text-[10px] uppercase">Top 3 Gaps</TableHead>
              <TableHead className="text-[10px] uppercase">Replay</TableHead>
              <TableHead className="text-[10px] uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs font-medium">{r.name}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {r.run_id ? r.run_id.slice(0, 8) : "—"}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {r.total_score != null ? `${r.total_score}/175` : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {r.top_3_gaps.length > 0 ? r.top_3_gaps.map(g => g.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase())).join(", ") : "—"}
                </TableCell>
                <TableCell>
                  {r.replay ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-semibold uppercase">
                      Yes
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">No</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`text-[10px] font-semibold ${r.status === "ok" ? "text-green-600" : "text-destructive"}`}>
                    {r.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {results.length === 0 && !loading && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Run QA to test the pipeline against 3 built-in fixtures (Strong Director, Senior IC, Emerging Director).
          </p>
        </div>
      )}
    </div>
  );
};

export default DirectorQARunner;
