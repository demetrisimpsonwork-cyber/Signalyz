import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowRight } from "lucide-react";

interface SessionRecoveryModalProps {
  inferredRole?: string;
  score?: number;
  onContinue: () => void;
  onStartFresh: () => void;
}

const SessionRecoveryModal = ({ inferredRole, score, onContinue, onStartFresh }: SessionRecoveryModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl p-6 space-y-5 animate-in fade-in-0 zoom-in-95 duration-200">
      <div className="space-y-1.5 text-center">
        <h2 className="text-lg font-bold text-foreground tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          You have a previous analysis session saved.
          {inferredRole && (
            <span className="block mt-1 text-xs text-foreground/70">
              {inferredRole}{score ? ` · Score: ${score}` : ""}
            </span>
          )}
        </p>
      </div>

      <div className="space-y-2.5">
        <Button onClick={onContinue} className="w-full gap-2" size="lg">
          <ArrowRight className="h-4 w-4" />
          Continue last session
        </Button>
        <Button onClick={onStartFresh} variant="outline" className="w-full gap-2" size="lg">
          <RefreshCw className="h-4 w-4" />
          Start new analysis
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground/60 text-center">
        Starting fresh will clear your previous results.
      </p>
    </div>
  </div>
);

export default SessionRecoveryModal;
