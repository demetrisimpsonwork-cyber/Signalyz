import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

const UpgradeModal = ({ open, onClose }: UpgradeModalProps) => {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md text-center">
        <DialogHeader className="items-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Unlock Deeper Alignment Intelligence</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            You've used your free alignments. Upgrade to access deeper employer signal analysis and competitive-level refinements.
          </DialogDescription>
        </DialogHeader>

        <div className="text-left space-y-2">
          <p className="text-sm font-medium text-foreground">What You Unlock with Pro:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">•</span>Expanded Gap Intelligence — clearer skill gaps + how to close them</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">•</span>Deeper Employer Signal Breakdown</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">•</span>Alignment History Tracking</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">•</span>Unlimited Refinements</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">•</span>Priority Processing</li>
          </ul>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => {
              onClose();
              navigate("/pricing");
            }}
          >
            <Sparkles className="h-4 w-4" />
            Unlock Pro Intelligence
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground/70" onClick={onClose}>
            Maybe later
          </Button>
        </div>

        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            Only $7/month — built for serious job seekers. Cancel anytime.
          </p>
          <p className="text-xs italic text-muted-foreground/60">
            Most users upgrade within their first week.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
