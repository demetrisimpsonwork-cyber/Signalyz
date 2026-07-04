import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

interface FeedbackRow {
  id: string;
  created_at: string;
  source: string;
  useful: boolean | null;
  applied_with_resume: boolean | null;
  outcome: string | null;
  comment: string | null;
  request_id: string | null;
  report_run_fingerprint: string | null;
  pipeline_version: string | null;
  plan_tier: string | null;
  session_id: string | null;
  user_id: string | null;
}

const CSV_HEADERS = [
  "created_at",
  "source",
  "useful",
  "applied_with_resume",
  "outcome",
  "comment",
  "request_id",
  "report_run_fingerprint",
  "pipeline_version",
  "plan_tier",
  "session_id",
  "user_id",
] as const;

function csvEscape(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows: FeedbackRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      CSV_HEADERS.map((key) => {
        const raw = row[key];
        if (typeof raw === "boolean") return raw ? "true" : "false";
        return csvEscape(raw);
      }).join(","),
    );
  }
  return lines.join("\n");
}

function formatBool(value: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

const FeedbackAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("user_feedback")
      .select(
        "id, created_at, source, useful, applied_with_resume, outcome, comment, request_id, report_run_fingerprint, pipeline_version, plan_tier, session_id, user_id",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setRows((data as FeedbackRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!isAdmin) return;
    void loadFeedback();
  }, [authLoading, user, isAdmin, navigate, loadFeedback]);

  const summary = useMemo(() => {
    const usefulYes = rows.filter((r) => r.useful === true).length;
    const appliedYes = rows.filter((r) => r.applied_with_resume === true).length;
    return { total: rows.length, usefulYes, appliedYes };
  }, [rows]);

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("No feedback to export.");
      return;
    }
    const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `signalyz-feedback-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  if (authLoading || (user && isAdmin && loading && rows.length === 0 && !error)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center space-y-3">
        <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
        <p className="text-sm text-muted-foreground">This page is for internal feedback review only.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Back to app
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">User feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {summary.total} responses · {summary.usefulYes} marked useful · {summary.appliedYes} applied
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadFeedback()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <p className="text-xs mt-1 text-muted-foreground">
            Ensure migration <code className="text-[11px]">20260704140000_user_feedback</code> is applied.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Useful</th>
              <th className="px-3 py-2 font-medium">Applied</th>
              <th className="px-3 py-2 font-medium">Outcome</th>
              <th className="px-3 py-2 font-medium">Comment</th>
              <th className="px-3 py-2 font-medium">Request</th>
              <th className="px-3 py-2 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No feedback yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/40 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {format(new Date(row.created_at), "MMM d, HH:mm")}
                </td>
                <td className="px-3 py-2">{row.source}</td>
                <td className="px-3 py-2">{formatBool(row.useful)}</td>
                <td className="px-3 py-2">{formatBool(row.applied_with_resume)}</td>
                <td className="px-3 py-2">{row.outcome ?? "—"}</td>
                <td className="px-3 py-2 max-w-[240px] truncate" title={row.comment ?? undefined}>
                  {row.comment ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate" title={row.request_id ?? undefined}>
                  {row.request_id?.slice(0, 8) ?? "—"}
                </td>
                <td className="px-3 py-2">{row.plan_tier ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FeedbackAdmin;
