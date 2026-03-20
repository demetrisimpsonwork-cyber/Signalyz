interface SignalActionPlanProps {
  alignmentResult: any;
}

function deriveActions(result: any): string[] {
  const actions: string[] = [];
  const seen = new Set<string>();

  const add = (text: string) => {
    const key = text.toLowerCase().slice(0, 40);
    if (!seen.has(key) && actions.length < 4) {
      seen.add(key);
      actions.push(text);
    }
  };

  // 1. From signal_model gaps (highest severity first)
  const gaps = result?.signal_model?.gaps || [];
  const sortedGaps = [...gaps].sort((a: any, b: any) => {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sevOrder[a?.severity] ?? 2) - (sevOrder[b?.severity] ?? 2);
  });

  for (const gap of sortedGaps) {
    if (gap?.fix_actions) {
      for (const action of gap.fix_actions) {
        if (typeof action === "string" && action.length > 10 && action.length < 120) {
          add(action.replace(/^\d+\.\s*/, "").replace(/\.$/, "") + ".");
        }
      }
    }
    if (actions.length >= 4) break;
  }

  // 2. From predicted_signal_lift dimensions
  const lift = result?.signal_model?.predicted_signal_lift?.dimensions ||
               result?.predicted_signal_lift?.dimensions || [];
  for (const dim of lift) {
    if (dim?.action && typeof dim.action === "string" && dim.action.length > 10) {
      add(dim.action.replace(/^\d+\.\s*/, "").replace(/\.$/, "") + ".");
    }
    if (actions.length >= 4) break;
  }

  // 3. From under_signaled_keywords
  const keywords = result?.signal_model?.under_signaled_keywords ||
                   result?.under_signaled_keywords || [];
  if (keywords.length > 0 && actions.length < 4) {
    const sample = keywords.slice(0, 3).join(", ");
    add(`Integrate key terms like ${sample} into your experience bullets.`);
  }

  // 4. From executive repositioning opportunity
  const reposition = result?.signal_model?.executive_insight_summary?.strategic_repositioning_opportunity ||
                     result?.executive_insight_summary?.strategic_repositioning_opportunity;
  if (reposition && typeof reposition === "string" && actions.length < 4) {
    const cleaned = reposition.length > 100 ? reposition.slice(0, 97) + "..." : reposition;
    add(cleaned.replace(/\.$/, "") + ".");
  }

  // 5. From score_rationale gaps
  if (actions.length < 3 && result?.score_rationale) {
    for (const r of result.score_rationale) {
      if (/missing|lacks?|absent|no evidence|weak|gap|insufficient|under-?signal/i.test(r) &&
          !/aligns|translates|demonstrates|detected/i.test(r)) {
        const text = r.replace(/^\[(GAP|STRENGTH)\]\s*/i, "");
        if (text.length > 15 && text.length < 100) {
          add(`Address gap: ${text.charAt(0).toLowerCase() + text.slice(1)}`.replace(/\.$/, "") + ".");
        }
      }
      if (actions.length >= 4) break;
    }
  }

  return actions;
}

const SignalActionPlan = ({ alignmentResult }: SignalActionPlanProps) => {
  const actions = deriveActions(alignmentResult);

  if (actions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3 min-w-0 w-full overflow-hidden">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Fix your score in {actions.length} moves
        </h3>
        <p className="text-xs text-muted-foreground">
          Do these {actions.length} things → move above 70%
        </p>
      </div>
      <ol className="space-y-2 pl-0">
        {actions.map((action, i) => (
          <li key={i} className="flex items-start gap-2.5 min-w-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {i + 1}
            </span>
            <span className="text-sm text-muted-foreground leading-relaxed break-words min-w-0">{action}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default SignalActionPlan;
