import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowRight } from "lucide-react";

interface SessionRecoveryModalProps {
  open: boolean;
  onContinue: () => void;
  onStartNew: () => void;
}

const SESSION_VERSION = 2;

export function getSessionVersion(): number {
  try {
    const raw = localStorage.getItem("signalyz_session_version");
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function setSessionVersion(): void {
  try {
    localStorage.setItem("signalyz_session_version", String(SESSION_VERSION));
  } catch {}
}

export function isSessionCompatible(): boolean {
  return getSessionVersion() === SESSION_VERSION;
}

export function clearSignalyzSession(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("signalyz_")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export default function SessionRecoveryModal({ open, onContinue, onStartNew }: SessionRecoveryModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm gap-5" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">Welcome back</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            You have a previous analysis session saved. Would you like to continue where you left off or start fresh?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={onContinue} className="w-full gap-2">
            <ArrowRight className="h-4 w-4" />
            Continue last session
          </Button>
          <Button onClick={onStartNew} variant="outline" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            Start new analysis
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
