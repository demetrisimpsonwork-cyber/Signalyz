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
          <DialogTitle className="text-xl">Want more resume remixes?</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            You've used all 3 free optimizations today.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Upgrade to Resumix Pro for unlimited optimizations, saved history, and priority AI processing.
        </p>

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
            Upgrade to Pro
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Maybe later
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Only $7/month — cancel anytime.
        </p>
        <p className="text-xs italic text-muted-foreground/70">
          Most users upgrade within their first week.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
