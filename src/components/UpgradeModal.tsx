import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

const UpgradeModal = ({ open, onClose }: UpgradeModalProps) => {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Unlock Employer Priority Intelligence™
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            You're viewing a strategic preview.
            <br />
            Upgrade to access the full employer decision model.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Free Tier</p>
            <ul className="space-y-2">
              {[
                "One aligned bullet",
                "Overall alignment score",
                "Surface-level gap indicators",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Pro</p>
            <ul className="space-y-2">
              {[
                "Multi-bullet strategic alignment",
                "Weighted employer priority breakdown",
                "Risk perception flags",
                "Positioning angle analysis",
                "Gap severity classification",
                "Interview leverage insights",
                "Unlimited strategic runs",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-5" />

        <p className="text-sm text-muted-foreground leading-relaxed">
          Hiring managers don't scan resumes.
          <br />
          They evaluate risk and signal strength.
          <br />
          <span className="text-foreground font-medium">Resumix shows you what they actually see.</span>
        </p>

        <Separator className="my-5" />

        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-foreground">Employer Priority Intelligence™</p>
            <p className="text-xs text-muted-foreground mt-0.5">$9/month — cancel anytime</p>
          </div>

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                onClose();
                navigate("/pricing");
              }}
            >
              Unlock Full Model
            </Button>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Most candidates optimize wording.
              <br />
              Strategic candidates optimize perception.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground/50 hover:text-muted-foreground"
              onClick={onClose}
            >
              Continue with free tier
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
