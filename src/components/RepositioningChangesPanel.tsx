import { ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

interface Dimension {
  name: string;
  direction: "improved" | "unchanged" | "reduced";
  explanation: string;
}

function analyzeDimensions(
  original: string,
  calibrated: CalibratedResumeData
): Dimension[] {
  const originalLower = original.toLowerCase();
  const allBullets = calibrated.experience.flatMap((e) => e.bullets);
  const bulletText = allBullets.join(" ").toLowerCase();

  // 1. Ownership Language Density
  const strongVerbs = [
    "led", "drove", "launched", "owned", "spearheaded", "delivered",
    "orchestrated", "directed", "managed", "established", "built",
    "transformed", "accelerated", "negotiated", "architected",
  ];
  const origOwnership = strongVerbs.filter((v) =>
    new RegExp(`\\b${v}\\b`).test(originalLower)
  ).length;
  const calOwnership = strongVerbs.filter((v) =>
    new RegExp(`\\b${v}\\b`).test(bulletText)
  ).length;
  const ownershipDelta = calOwnership - origOwnership;

  // 2. JD Keyword Alignment (signal_keywords present in calibrated)
  const kws = calibrated.signal_keywords || [];
  const kwsInCal = kws.filter((k) => bulletText.includes(k.toLowerCase())).length;
  const kwsInOrig = kws.filter((k) => originalLower.includes(k.toLowerCase())).length;
  const kwDelta = kwsInCal - kwsInOrig;

  // 3. Action Verb Lead Rate
  const actionVerbs = [
    "achieved", "built", "created", "delivered", "drove", "enabled",
    "established", "executed", "generated", "implemented", "improved",
    "increased", "launched", "led", "managed", "negotiated", "optimized",
    "orchestrated", "reduced", "scaled", "spearheaded", "streamlined",
    "transformed",
  ];
  const countLeads = (bullets: string[]) =>
    bullets.filter((b) => {
      const first = b.trim().split(/\s/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
      return actionVerbs.includes(first);
    }).length;
  const origBulletLines = original.split("\n").filter((l) => l.trim().startsWith("-") || l.trim().startsWith("•"));
  const origLeads = countLeads(origBulletLines.map((l) => l.replace(/^[-•]\s*/, "")));
  const calLeads = countLeads(allBullets);
  const verbDelta = calLeads - origLeads;

  // 4. Outcome Framing (metrics: $, %, numbers)
  const countOutcomes = (text: string) =>
    (text.match(/\$[\d,.]+|[\d,.]+%|\b\d{2,}\b/g) || []).length;
  const origOutcomes = countOutcomes(original);
  const calOutcomes = countOutcomes(allBullets.join(" "));
  const outcomeDelta = calOutcomes - origOutcomes;

  // 5. Passive Language
  const passivePattern = /\b(was|were|been|being|is|are)\s+\w+ed\b/gi;
  const origPassive = (original.match(passivePattern) || []).length;
  const calPassive = (allBullets.join(" ").match(passivePattern) || []).length;
  const passiveDelta = origPassive - calPassive; // positive = improvement (fewer passive)

  const dim = (
    name: string,
    delta: number,
    improvedMsg: string,
    unchangedMsg: string,
    reducedMsg: string,
    invert = false
  ): Dimension => {
    const effective = invert ? -delta : delta;
    if (effective > 0) return { name, direction: "improved", explanation: improvedMsg };
    if (effective < 0) return { name, direction: "reduced", explanation: reducedMsg };
    return { name, direction: "unchanged", explanation: unchangedMsg };
  };

  return [
    dim(
      "Ownership Language Density",
      ownershipDelta,
      `Stronger action verb openers across ${Math.abs(ownershipDelta)} bullets`,
      "Ownership language remained consistent",
      "Some ownership verbs were softened"
    ),
    dim(
      "JD Keyword Alignment",
      kwDelta,
      `${Math.abs(kwDelta)} role-specific term${kwDelta !== 1 ? "s" : ""} added to experience section`,
      "Keyword alignment unchanged",
      "Some keywords were removed"
    ),
    dim(
      "Action Verb Lead Rate",
      verbDelta,
      `${Math.abs(verbDelta)} more bullet${verbDelta !== 1 ? "s" : ""} now open with strong action verbs`,
      "Action verb lead rate unchanged",
      "Fewer bullets lead with action verbs"
    ),
    dim(
      "Outcome Framing",
      Math.max(0, outcomeDelta),
      `${Math.abs(outcomeDelta)} additional quantified outcome${outcomeDelta !== 1 ? "s" : ""} surfaced`,
      "Outcome framing preserved",
      "Outcome framing preserved"
    ),
    dim(
      "Passive Language",
      passiveDelta,
      `${Math.abs(passiveDelta)} passive construction${passiveDelta !== 1 ? "s" : ""} replaced`,
      "Passive language level unchanged",
      "More passive constructions detected",
      false
    ),
  ];
}

const directionConfig = {
  improved: {
    icon: ArrowUp,
    label: "Improved",
    className: "text-emerald-500",
  },
  unchanged: {
    icon: ArrowRight,
    label: "Unchanged",
    className: "text-muted-foreground",
  },
  reduced: {
    icon: ArrowDown,
    label: "Reduced",
    className: "text-amber-500",
  },
};

interface RepositioningChangesPanelProps {
  originalResume: string;
  calibratedResume: CalibratedResumeData;
}

const RepositioningChangesPanel = ({
  originalResume,
  calibratedResume,
}: RepositioningChangesPanelProps) => {
  const dimensions = analyzeDimensions(originalResume, calibratedResume);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">
          What Repositioning Changed
        </h3>
        <p className="text-xs text-muted-foreground">
          How the calibrated resume improved your hiring signal.
        </p>
      </div>

      <div className="space-y-2.5">
        {dimensions.map((dim) => {
          const config = directionConfig[dim.direction];
          const Icon = config.icon;
          return (
            <div
              key={dim.name}
              className="flex items-start gap-3 text-sm"
            >
              <span className="font-medium text-foreground min-w-[180px] shrink-0">
                {dim.name}
              </span>
              <span className={`flex items-center gap-1 shrink-0 font-medium ${config.className}`}>
                <Icon className="h-3.5 w-3.5" />
                {config.label}
              </span>
              <span className="text-muted-foreground text-xs leading-5">
                — {dim.explanation}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RepositioningChangesPanel;
