import { Button } from "@/components/ui/button";
import { RotateCcw, Plus } from "lucide-react";

interface SessionRecoveryModalProps {
  onContinue: () => void;
  onStartNew: () => void;
}

const SessionRecoveryModal = ({ onContinue, onStartNew }: SessionRecoveryModalProps) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-[420px] mx-4 rounded-xl bg-card border border-border p-6 shadow-2xl space-y-5">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">Previous session found</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You have a previous alignment analysis saved. Would you like to pick up where you left off?
          </p>
        </div>

        <div className="space-y-2.5">
          <Button className="w-full gap-2" onClick={onContinue}>
            <RotateCcw className="h-4 w-4" />
            Continue last session
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={onStartNew}>
            <Plus className="h-4 w-4" />
            Start new analysis
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SessionRecoveryModal;
