import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

const ProInsightsTeaser = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-2">
      {/* Section heading */}
      <h3 className="text-sm font-semibold text-primary">🔒 Pro Insights</h3>

      <div className="relative overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
        {/* Blurred placeholder content */}
        <div className="select-none space-y-2 blur-[6px]" aria-hidden="true">
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="h-3 w-3/5 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
        </div>

        {/* Overlay with CTA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 px-6 text-center">
          <p className="mb-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Unlock advanced ATS-optimized rewrites, detailed keyword explanations, and personalized tips to make your resume stand out.
          </p>
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Unlock unlimited optimizations and premium insights.
          </p>
          <Button
            size="sm"
            onClick={() => navigate("/pricing")}
            className="gap-2 shadow-md hover:brightness-110 transition-all"
          >
            Upgrade to Pro
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProInsightsTeaser;
