import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type {
  GroundedRecommendation,
  GroundedRecommendationDisplayEvidence,
  GroundedRecommendationInsights,
} from "@/lib/groundedRecommendationTypes";
import { GAP_TYPE_LABEL, type GapType } from "@/lib/gapTaxonomy";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const classificationStyle: Record<GroundedRecommendation["classification"], string> = {
  present:
    "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40",
  partial:
    "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  missing: "text-muted-foreground bg-muted/30 border-border/60",
};

// Gap-type badge styling — deliberately not alarmist. Transferable/Preferred/
// Domain read as "reframe/optional/trainable"; only Direct is a firm miss.
const gapTypeStyle: Record<GapType, string> = {
  transferable:
    "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  preferred:
    "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/40",
  domain:
    "text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/40",
  direct:
    "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40",
};

function RecommendationEvidence({
  signalName,
  displayEvidence,
}: {
  signalName: string;
  displayEvidence?: GroundedRecommendationDisplayEvidence[];
}) {
  if (!displayEvidence?.length) return null;

  return (
    <div className="space-y-1 pt-1">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        Evidence
      </p>
      {displayEvidence.map((entry, i) => (
        <p
          key={`${signalName}-ev-${i}`}
          className="text-[10px] text-muted-foreground/80 italic leading-relaxed pl-3 border-l-2 border-primary/40"
        >
          {entry.is_duplicate
            ? `Same evidence as "${entry.duplicate_of_signal}" — not repeated here.`
            : `"${entry.text}"`}
        </p>
      ))}
    </div>
  );
}

function RecommendationCard({
  rec,
  displayEvidence,
  featured = false,
}: {
  rec: GroundedRecommendation;
  displayEvidence?: GroundedRecommendationDisplayEvidence[];
  featured?: boolean;
}) {
  return (
    <div
      className={`px-4 py-4 space-y-2 ${featured ? "bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/60 dark:border-amber-800/30 rounded-lg mx-3 my-3" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-foreground">{rec.signal_name}</p>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${classificationStyle[rec.classification]}`}
        >
          {rec.classification}
        </span>
        {rec.gap_type && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${gapTypeStyle[rec.gap_type]}`}
          >
            {GAP_TYPE_LABEL[rec.gap_type]}
          </span>
        )}
        {featured && (
          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            Most defensible repositioning
          </span>
        )}
        {!rec.grounded && <span className="text-[10px] text-muted-foreground">Unverified</span>}
      </div>
      <p className="text-[10px] text-muted-foreground">{rec.classification_reason}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{rec.recommendation}</p>
      {rec.gap_type && rec.gap_type_rationale && (
        <p className="text-[10px] text-muted-foreground/80 italic leading-relaxed">
          {rec.gap_type_rationale}
        </p>
      )}
      <RecommendationEvidence signalName={rec.signal_name} displayEvidence={displayEvidence} />
    </div>
  );
}

function GroupSection({
  label,
  recommendations,
  displayEvidence,
  featuredSignal,
}: {
  label: string;
  recommendations: GroundedRecommendation[];
  displayEvidence: GroundedRecommendationInsights["display_evidence"];
  featuredSignal?: string | null;
}) {
  if (recommendations.length === 0) return null;

  return (
    <div>
      <p className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/40 bg-muted/20">
        {label}
      </p>
      <div className="divide-y divide-border/50">
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.signal_name}
            rec={rec}
            displayEvidence={displayEvidence[rec.signal_name]}
            featured={featuredSignal === rec.signal_name}
          />
        ))}
      </div>
    </div>
  );
}

export function GroundedNextStepsPanel({ insights }: { insights: GroundedRecommendationInsights }) {
  const [gapsOpen, setGapsOpen] = useState(false);
  const { featured_repositioning, highest_impact, already_supported, additional_gaps, display_evidence } =
    insights;

  const impactWithoutFeatured = highest_impact.filter(
    (r) => r.signal_name !== featured_repositioning?.signal_name,
  );

  return (
    <div className="divide-y divide-border/50">
      {featured_repositioning && (
        <div>
          <p className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/40 bg-muted/20">
            Most Defensible Repositioning Opportunity
          </p>
          <RecommendationCard
            rec={featured_repositioning}
            displayEvidence={display_evidence[featured_repositioning.signal_name]}
            featured
          />
        </div>
      )}

      <GroupSection
        label="Highest Impact Opportunities"
        recommendations={impactWithoutFeatured}
        displayEvidence={display_evidence}
      />

      <GroupSection
        label="Already Supported Signals"
        recommendations={already_supported}
        displayEvidence={display_evidence}
      />

      {additional_gaps.length > 0 && (
        <Collapsible open={gapsOpen} onOpenChange={setGapsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:bg-muted/30 transition-colors">
            Additional Gaps ({additional_gaps.length})
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${gapsOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y divide-border/50 border-t border-border/40">
              {additional_gaps.map((rec) => (
                <RecommendationCard
                  key={rec.signal_name}
                  rec={rec}
                  displayEvidence={display_evidence[rec.signal_name]}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
