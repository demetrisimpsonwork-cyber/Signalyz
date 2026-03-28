import { ArrowUp, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { computePillarScores } from "@/lib/deterministicScore";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/** Convert structured resume to plain text for scoring */
function resumeDataToText(r: CalibratedResumeData): string {
  const lines: string[] = [];
  if (r.header.name) lines.push(r.header.name);
  if (r.header.title) lines.push(r.header.title);
  if (r.summary) { lines.push("", "SUMMARY", r.summary); }
  if (r.core_competencies.length) { lines.push("", "CORE COMPETENCIES", r.core_competencies.join(" · ")); }
  if (r.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const exp of r.experience) {
      lines.push([exp.title, exp.company, exp.dates].filter(Boolean).join(" | "));
      for (const b of exp.bullets) lines.push(`- ${b}`);
    }
  }
  if (r.skills.length) { lines.push("", "SKILLS", r.skills.join(", ")); }
  return lines.join("\n");
}

interface Pillar {
  name: string;
  weight: string;
  origScore: number;
  calScore: number;
  delta: number;
  explanation: string;
}

function buildPillars(originalResume: string, calibratedResume: CalibratedResumeData, jdText: string): Pillar[] {
  const calText = resumeDataToText(calibratedResume);
  const orig = computePillarScores(originalResume, jdText);
  const cal = computePillarScores(calText, jdText);

  const mkExplanation = (name: string, origVal: number, calVal: number): string => {
    const delta = calVal - origVal;
    if (delta <= 0) return `${name} preserved at ${calVal}%`;
    switch (name) {
      case "Role Outcomes":
        return `+${delta}% — strengthened ownership language, scope framing, and outcome evidence`;
      case "Tools & Workflow":
        return `+${delta}% — added role-specific terms and JD-aligned vocabulary across bullets`;
      case "Domain & Context":
        return `+${delta}% — seniority and impact language shifted closer to JD target level`;
      case "Context & Scale":
        return `+${delta}% — improved scope indicators and operational breadth framing`;
      case "Communication & Leadership":
        return `+${delta}% — elevated stakeholder language and reduced passive constructions`;
      default:
        return `+${delta}% improvement`;
    }
  };

  return [
    {
      name: "Role Outcomes",
      weight: "30%",
      origScore: orig.roleOutcomes,
      calScore: cal.roleOutcomes,
      // Never show reduced for role outcomes
      delta: Math.max(0, cal.roleOutcomes - orig.roleOutcomes),
      explanation: mkExplanation("Role Outcomes", orig.roleOutcomes, Math.max(orig.roleOutcomes, cal.roleOutcomes)),
    },
    {
      name: "Tools & Workflow",
      weight: "20%",
      origScore: orig.toolsWorkflow,
      calScore: cal.toolsWorkflow,
      delta: cal.toolsWorkflow - orig.toolsWorkflow,
      explanation: mkExplanation("Tools & Workflow", orig.toolsWorkflow, cal.toolsWorkflow),
    },
    {
      name: "Domain & Context",
      weight: "20%",
      origScore: orig.domainContext,
      calScore: cal.domainContext,
      delta: cal.domainContext - orig.domainContext,
      explanation: mkExplanation("Domain & Context", orig.domainContext, cal.domainContext),
    },
    {
      name: "Context & Scale",
      weight: "15%",
      origScore: orig.contextScale,
      calScore: cal.contextScale,
      delta: cal.contextScale - orig.contextScale,
      explanation: mkExplanation("Context & Scale", orig.contextScale, cal.contextScale),
    },
    {
      name: "Communication & Leadership",
      weight: "15%",
      origScore: orig.communicationLeadership,
      calScore: cal.communicationLeadership,
      delta: cal.communicationLeadership - orig.communicationLeadership,
      explanation: mkExplanation("Communication & Leadership", orig.communicationLeadership, cal.communicationLeadership),
    },
  ];
}

interface RepositioningChangesPanelProps {
  originalResume: string;
  calibratedResume: CalibratedResumeData;
  jdText?: string;
}

const RepositioningChangesPanel = ({
  originalResume,
  calibratedResume,
  jdText,
}: RepositioningChangesPanelProps) => {
  const pillars = useMemo(() => {
    if (!jdText) return null;
    return buildPillars(originalResume, calibratedResume, jdText);
  }, [originalResume, calibratedResume, jdText]);

  if (!pillars) return null;

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5 space-y-4 min-w-0 w-full overflow-hidden">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">
          What Repositioning Changed
        </h3>
        <p className="text-xs text-muted-foreground">
          Per-pillar scoring delta between your original and calibrated resume.
        </p>
      </div>

      <div className="space-y-3 sm:space-y-2.5">
        {pillars.map((p) => {
          const isImproved = p.delta > 0;
          return (
            <div
              key={p.name}
              className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 text-sm border-b border-border/30 pb-3 sm:pb-0 sm:border-0 last:border-0 last:pb-0"
            >
              <span className="font-medium text-foreground sm:min-w-[210px] sm:shrink-0 break-words">
                {p.name}
                <span className="text-[10px] text-muted-foreground ml-1">({p.weight})</span>
              </span>
              <span className={`flex items-center gap-1 shrink-0 font-medium text-xs ${isImproved ? "text-emerald-500" : "text-muted-foreground"}`}>
                {isImproved ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {isImproved ? `+${p.delta}%` : "Unchanged"}
              </span>
              <span className="text-muted-foreground text-xs leading-5 break-words">
                {p.explanation}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RepositioningChangesPanel;
