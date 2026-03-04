import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import type { PasteQuality } from "@/lib/resumeIntake";

interface ResumePasteQualityProps {
  quality: PasteQuality | null;
}

const ResumePasteQuality = ({ quality }: ResumePasteQualityProps) => {
  if (!quality) return null;

  const config = {
    good: {
      icon: CheckCircle,
      label: "Looks good",
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-950/30",
      border: "border-green-200 dark:border-green-800/40",
    },
    usable: {
      icon: AlertTriangle,
      label: "Usable but may be incomplete",
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      border: "border-yellow-200 dark:border-yellow-800/40",
    },
    needs_more: {
      icon: Info,
      label: "Needs more work history",
      color: "text-muted-foreground",
      bg: "bg-muted/30",
      border: "border-border",
    },
  }[quality];

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${config.bg} ${config.border}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />
      <span className={config.color}>{config.label}</span>
      <span className="text-muted-foreground ml-auto">
        Tip: paste your Experience section for best results. Bullets not required.
      </span>
    </div>
  );
};

export default ResumePasteQuality;
