import { useState } from "react";
import { Bug, Copy, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { initiateCheckout } from "@/utils/stripe";
import { useAuth } from "@/hooks/useAuth";

export interface DebugInfo {
  request_id?: string;
  status_code?: number;
  error_code?: string;
  message?: string;
  payload_length?: number;
  response_snippet?: string;
  timestamp?: string;
}

interface DebugPanelProps {
  lastDebug: DebugInfo | null;
}

const DebugPanel = ({ lastDebug }: DebugPanelProps) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!lastDebug) return null;

  const copyDebugInfo = async () => {
    const info = JSON.stringify(lastDebug, null, 2);
    await navigator.clipboard.writeText(info);
    setCopied(true);
    toast.success("Debug info copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed top-16 right-4 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-mono bg-muted/80 text-muted-foreground hover:bg-muted border border-border/50 transition-colors"
        title="Debug Mode"
      >
        <Bug className="h-3 w-3" />
        {lastDebug.request_id ? `#${lastDebug.request_id.slice(0, 8)}` : "Debug"}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-80 rounded-lg border bg-card shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Debug Info</span>
            <button onClick={() => setOpen(false)} className="p-0.5 hover:bg-muted rounded">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-1.5 text-[11px] font-mono">
            {lastDebug.request_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">request_id</span>
                <span className="text-foreground">{lastDebug.request_id.slice(0, 12)}…</span>
              </div>
            )}
            {lastDebug.status_code !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">status</span>
                <span className={lastDebug.status_code === 200 ? "text-green-500" : "text-destructive"}>{lastDebug.status_code}</span>
              </div>
            )}
            {lastDebug.error_code && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">error_code</span>
                <span className="text-destructive">{lastDebug.error_code}</span>
              </div>
            )}
            {lastDebug.payload_length !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">payload</span>
                <span className="text-foreground">{lastDebug.payload_length.toLocaleString()} chars</span>
              </div>
            )}
            {lastDebug.timestamp && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">time</span>
                <span className="text-foreground">{new Date(lastDebug.timestamp).toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          {lastDebug.response_snippet && (
            <div className="mt-2 p-2 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
              {lastDebug.response_snippet}
            </div>
          )}

          <Button size="sm" variant="outline" onClick={copyDebugInfo} className="w-full text-xs mt-2">
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            Copy Debug Info
          </Button>
        </div>
      )}
    </div>
  );
};

export default DebugPanel;

// Error card shown inline in results area
export const EngineErrorCard = ({
  message,
  onRetry,
}: {
  message?: string;
  debugInfo?: DebugInfo; // kept for backward compat, ignored in UI
  onRetry?: () => void;
}) => {
  const displayMessage = message || "Generation took longer than expected. Tap to retry.";
  const isDailyLimit = displayMessage.toLowerCase().includes("daily") || displayMessage.toLowerCase().includes("free") || displayMessage.toLowerCase().includes("limit");

  if (isDailyLimit) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-4 my-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-sm font-bold">3</span>
          </div>
          <div className="space-y-1 flex-1">
            <p className="text-sm font-semibold text-foreground">Daily limit reached</p>
            <p className="text-sm text-muted-foreground">You've used your 3 free alignments for today. Upgrade to continue with unlimited alignments.</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
          onClick={() => initiateCheckout()}
        >
          Unlock Resumix Pro — $19/month
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3 my-6">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
          <X className="h-4 w-4 text-destructive" />
        </div>
        <div className="space-y-1 flex-1">
          <p className="text-sm font-semibold text-foreground">Analysis Engine Error</p>
          <p className="text-sm text-muted-foreground">{displayMessage}</p>
        </div>
      </div>

      {onRetry && (
        <div className="flex gap-2">
          <Button size="sm" onClick={onRetry} className="text-xs">
            Retry Analysis
          </Button>
        </div>
      )}
    </div>
  );
};
