import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const ProInsightsTeaser = () => {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border bg-card shadow-md overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-primary">Resumix Pro</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Full signal calibration engine — unlimited alignments, all diagnostic modules.
        </p>
      </div>

      <div className="px-5 pb-5 space-y-4">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Unlimited alignments</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Full Identity Strength Index™ (all 4 pillars)</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Complete Signal Risk Projection (all 5 stages)</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Multi-variant repositioned bullets</li>
          <li className="flex items-center gap-2"><span className="text-primary">•</span> Build My Calibrated Resume (DOCX export)</li>
        </ul>

        <p className="text-xs text-muted-foreground/80 italic">
          Most users get interview-ready in one session.
        </p>

        <div className="space-y-2 pt-1">
          <Button
            onClick={() => navigate("/pricing")}
            className="w-full gap-2 shadow-md hover:brightness-110 transition-all text-sm"
          >
            <Lock className="h-3.5 w-3.5" />
            Unlock Resumix Pro — $19/month
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Less than one rejected application costs you.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProInsightsTeaser;
