import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const ProInsightsTeaser = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-primary">Pro Alignment Intelligence</h3>
      </div>

      <div className="relative overflow-hidden rounded-lg border bg-card p-6 shadow-sm">
        {/* Blurred preview content */}
        <div className="select-none space-y-3 blur-[5px]" aria-hidden="true">
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="h-3 w-3/5 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/70 px-6 text-center">
          <p className="mb-3 text-sm font-medium text-foreground">Unlock:</p>
          <ul className="mb-4 space-y-1 text-left text-sm text-muted-foreground">
            <li>• Weighted Priority Breakdown</li>
            <li>• Advanced Gap Diagnostics</li>
            <li>• Alignment History Tracking</li>
            <li>• Deeper Keyword Clustering</li>
            <li>• Unlimited Alignments</li>
          </ul>
          <Button
            size="sm"
            onClick={() => navigate("/pricing")}
            className="gap-2 shadow-md hover:brightness-110 transition-all"
          >
            Unlock Pro Alignment Intelligence — $9/month
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Prove alignment with clarity. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProInsightsTeaser;
