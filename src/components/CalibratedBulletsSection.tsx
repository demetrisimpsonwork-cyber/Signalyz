import { useMemo } from "react";
import { parseResumeIntake } from "@/lib/resumeIntake";
import EvidenceLedger from "@/components/EvidenceLedger";
import ResultSection from "@/components/ResultSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { antiAIFilter } from "@/lib/antiAIFilter";

/**
 * Directional signal impact analysis — compares original vs calibrated text
 * to identify WHICH dimension improved. No fabricated numbers.
 */
function detectSignalImpact(original: string, calibrated: string): string[] {
  const impacts: string[] = [];
  const origLower = original.toLowerCase();
  const calLower = calibrated.toLowerCase();

  const ownershipVerbs = /^(led|managed|owned|built|drove|spearheaded|directed|oversaw|orchestrated|championed|architected|launched)/i;
  if (ownershipVerbs.test(calibrated.trim()) && !ownershipVerbs.test(original.trim())) {
    impacts.push("Strengthens ownership signal");
  }

  const outcomePatterns = /\b(resulting in|which led to|saving|achieving|improving|reducing|increasing|generating|delivering|driving|growing|cutting|boosting)\b/i;
  const calOutcomes = (calLower.match(outcomePatterns) || []).length;
  const origOutcomes = (origLower.match(outcomePatterns) || []).length;
  if (calOutcomes > origOutcomes) {
    impacts.push("Improves outcome framing");
  }

  const calMetrics = (calibrated.match(/\d+[%$+x]|\$[\d,.]+|\b\d{2,}\b/g) || []).length;
  const origMetrics = (original.match(/\d+[%$+x]|\$[\d,.]+|\b\d{2,}\b/g) || []).length;
  if (calMetrics > origMetrics) {
    impacts.push("Adds quantified impact");
  }

  const calWords = new Set(calLower.match(/\b[a-z]{4,}\b/g) || []);
  const origWords = new Set(origLower.match(/\b[a-z]{4,}\b/g) || []);
  let newTerms = 0;
  calWords.forEach(w => { if (!origWords.has(w)) newTerms++; });
  if (newTerms >= 3) {
    impacts.push("Improves keyword alignment");
  }

  const passivePattern = /\b(was|were|been|being)\s+(asked|given|told|assigned|responsible|involved|tasked)\b/gi;
  const origPassive = (original.match(passivePattern) || []).length;
  const calPassive = (calibrated.match(passivePattern) || []).length;
  if (origPassive > 0 && calPassive < origPassive) {
    impacts.push("Removes passive voice");
  }

  if (impacts.length === 0) {
    impacts.push("Clarifies role signal");
  }

  return impacts.slice(0, 2);
}

interface CalibratedBulletsSectionProps {
  bullet: string;
  result: {
    optimized_bullet: string;
    used_signals?: string[];
    alt_a: string;
    alt_b: string;
    signal_model?: {
      evidence_ledger?: Array<{ claim: string; source: string; evidence: string }>;
    };
  };
  effectiveIsPro: boolean;
  onUpgrade?: () => void;
}

const CalibratedBulletsSection = ({ bullet, result, effectiveIsPro, onUpgrade }: CalibratedBulletsSectionProps) => {
  const parsedRoles = useMemo(() => {
    try {
      const intake = parseResumeIntake(bullet);
      if (intake.status === "error" || intake.sections.experience.length === 0) {
        return null;
      }
      return intake.sections.experience;
    } catch {
      return null;
    }
  }, [bullet]);

  const topBullets = useMemo(() => {
    if (!parsedRoles) return [];
    const bullets: Array<{ role: string; company: string; bullet: string }> = [];
    for (const role of parsedRoles) {
      for (const resp of role.responsibilities.slice(0, 4)) {
        if (resp.trim().length >= 10) {
          bullets.push({
            role: role.role_title || "Role",
            company: role.company || "",
            bullet: cleanBulletText(resp),
          });
        }
      }
    }
    return bullets
      .sort((a, b) => {
        const aFallback = a.bullet === FALLBACK_BULLET ? 1 : 0;
        const bFallback = b.bullet === FALLBACK_BULLET ? 1 : 0;
        if (aFallback !== bFallback) return aFallback - bFallback;
        return b.bullet.length - a.bullet.length;
      })
      .slice(0, 5);
  }, [parsedRoles]);

  const primaryBullet = topBullets.find((b) => b.bullet !== FALLBACK_BULLET) ?? null;
  const additionalBullets = topBullets.filter(
    (b) => b.bullet !== FALLBACK_BULLET && b.bullet !== primaryBullet?.bullet,
  );

  const primaryCalibrated = antiAIFilter(result.optimized_bullet);
  const primaryImpacts = primaryBullet
    ? detectSignalImpact(primaryBullet.bullet, primaryCalibrated)
    : [];

  const evidenceEntries = result.signal_model?.evidence_ledger
    ?.filter(e => e.source === "resume")
    .slice(0, 2)
    .map(e => ({
      claim: e.evidence || e.claim,
      resume_snippet: e.evidence || e.claim,
      source_section: "Resume",
      confidence: "High" as const,
    }));

  const hasDistinctAltA = result.alt_a && result.alt_a !== result.optimized_bullet;
  const hasDistinctAltB = result.alt_b && result.alt_b !== result.optimized_bullet && result.alt_b !== result.alt_a;

  if (!parsedRoles || topBullets.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="section-label section-header">Calibrated Bullets</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          One primary repositioned bullet per alignment run. Alternative phrasings appear below when available.
        </p>
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <p className="text-sm text-muted-foreground">Could not extract individual bullets from your resume. Showing calibrated output only.</p>
        </div>
        {effectiveIsPro ? (
          <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-2">
            <p className="section-label text-primary">Primary Repositioned Bullet</p>
            <p className="text-sm text-foreground leading-relaxed">{primaryCalibrated}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-primary/30 bg-card p-6 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">Repositioned bullet variants calibrated to this role</p>
            <p className="text-xs text-muted-foreground">Unlock repositioned bullet variants calibrated to this role&apos;s hiring signal.</p>
            {onUpgrade && (
              <Button size="sm" onClick={onUpgrade} className="mt-1">Unlock Full Signal Intelligence →</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="section-label section-header">Calibrated Bullets</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Each alignment run produces <span className="font-medium text-foreground">one primary repositioned bullet</span> for your strongest experience signal.
        Alternative phrasings below are different ways to express that same repositioning — not per-bullet rewrites.
      </p>

      {/* Primary 1:1 pairing — only bullet that has a calibrated counterpart */}
      {primaryBullet && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-baseline gap-2">
            <p className="section-label">Primary Experience Bullet</p>
            {(primaryBullet.role || primaryBullet.company) && (
              <span className="text-[10px] text-muted-foreground/60">
                {[primaryBullet.role, primaryBullet.company].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{primaryBullet.bullet}</p>
          <div className="border-t border-border/40 pt-3">
            <p className="section-label text-primary mb-1.5">Primary Repositioned Bullet</p>
            <p className="text-sm text-foreground leading-relaxed">{primaryCalibrated}</p>
          </div>
          {primaryImpacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {primaryImpacts.map((impact, j) => (
                <Badge key={j} variant="secondary" className="text-[10px] font-medium px-2 py-0.5">
                  {impact}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Additional originals — no fabricated calibrated mapping */}
      {additionalBullets.length > 0 && (
        <div className="rounded-xl border border-dashed bg-card p-5 space-y-3">
          <p className="section-label">Additional Experience Bullets</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Not individually repositioned in this run. Use the Calibrated Resume tab for full-document rewriting.
          </p>
          <ul className="space-y-3">
            {(effectiveIsPro ? additionalBullets : additionalBullets.slice(0, 1)).map((item, i) => (
              <li key={i} className="space-y-1">
                {(item.role || item.company) && (
                  <p className="text-[10px] text-muted-foreground/60">
                    {[item.role, item.company].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{item.bullet}</p>
              </li>
            ))}
          </ul>
          {!effectiveIsPro && additionalBullets.length > 1 && onUpgrade && (
            <Button size="sm" variant="outline" onClick={onUpgrade} className="w-full">
              Unlock {additionalBullets.length - 1} more bullets →
            </Button>
          )}
        </div>
      )}

      {effectiveIsPro ? (
        <>
          {hasDistinctAltA && (
            <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-2">
              <p className="section-label text-primary">Variant A — Outcome / Impact Framing</p>
              <p className="text-[11px] text-muted-foreground">Alternative phrasing for the primary repositioned bullet above.</p>
              <p className="text-sm text-foreground leading-relaxed">{antiAIFilter(result.alt_a)}</p>
              <EvidenceLedger entries={evidenceEntries} />
            </div>
          )}

          {hasDistinctAltB && (
            <ResultSection
              title="Variant B — Strategic Depth Expansion"
              content={antiAIFilter(result.alt_b)}
            />
          )}

          {(result.used_signals && result.used_signals.length > 0) && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
              <p className="section-label">Signals applied</p>
              <ul className="space-y-0.5">
                {result.used_signals.map((s, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-primary/30 bg-card p-6 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">Alternative repositioned phrasings for this role</p>
          <p className="text-xs text-muted-foreground">Unlock additional variants calibrated to this role&apos;s hiring signal.</p>
          {onUpgrade && (
            <Button size="sm" onClick={onUpgrade} className="mt-1">Unlock Full Signal Intelligence →</Button>
          )}
        </div>
      )}

      <p className="context-text text-center pt-1">
        Repositioned using only language from your original resume. No experience was invented.
      </p>
    </div>
  );
};

const FALLBACK_BULLET = "Source bullet from uploaded resume";

function cleanBulletText(raw: string): string {
  const t = raw.trim();
  const words = t.split(/\s+/);

  if (t.length < 30 || words.length < 5) return FALLBACK_BULLET;
  if (!/^[A-Z0-9]/.test(t)) return FALLBACK_BULLET;

  const firstWordLower = words[0]?.toLowerCase().replace(/[^a-z]/g, "");
  const BAD_OPENERS = new Set([
    "and","or","but","nor","yet","so","for","with","from","into","through",
    "about","above","below","between","during","after","before","since","until",
    "the","a","an","to","of","in","on","at","by","as","is","was","were","are",
    "it","its","this","that","these","those","which","who","whom","whose",
  ]);
  if (BAD_OPENERS.has(firstWordLower)) return FALLBACK_BULLET;

  if (/\b(Bachelor|Master|Associate|Diploma|GPA|Dean.s List|Coursework|University|College|School|Degree|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D|High\s+School|Magna|Summa|Cum\s+Laude)\b/i.test(t)) return FALLBACK_BULLET;
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*[·]\s*[A-Z]{2}\b/.test(t)) return FALLBACK_BULLET;
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\b/.test(t) && t.length < 150) return FALLBACK_BULLET;
  if (/\S+@\S+\.\S+/.test(t)) return FALLBACK_BULLET;
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(t)) return FALLBACK_BULLET;
  if (/https?:\/\//.test(t)) return FALLBACK_BULLET;
  if (/linkedin|github\.com/i.test(t)) return FALLBACK_BULLET;
  if (/\b(Certified|Certificate|Certification|License|Licensed|Award|Honor|Member|Membership)\b/i.test(t) && t.length < 100) return FALLBACK_BULLET;

  const commas = (t.match(/,/g) || []).length;
  if (commas >= 3 && commas / words.length > 0.2) return FALLBACK_BULLET;
  if ((t.match(/[|\/·]/g) || []).length >= 2) return FALLBACK_BULLET;

  const upperChars = (t.match(/[A-Z]/g) || []).length;
  if (upperChars / t.length > 0.45 && t.length < 80) return FALLBACK_BULLET;

  const capsWords = words.filter(w => /^[A-Z][a-zA-Z]*$/.test(w) && w.length > 1).length;
  if (capsWords / words.length > 0.5 && words.length > 4) return FALLBACK_BULLET;

  const dateMatches = t.match(/\b(19|20)\d{2}\b/g);
  if (dateMatches && dateMatches.length >= 2 && t.length < 100) return FALLBACK_BULLET;

  const hasActionVerb = /^(Led|Managed|Owned|Built|Created|Developed|Designed|Implemented|Improved|Executed|Coordinated|Supported|Resolved|Reduced|Increased|Streamlined|Analyzed|Communicated|Partnered|Trained|Automated|Documented|Delivered|Oversaw|Directed|Established|Facilitated|Negotiated|Optimized|Spearheaded|Launched|Maintained|Monitored|Organized|Planned|Produced|Provided|Reported|Supervised|Tracked|Prepared|Reviewed|Conducted|Assisted|Processed|Collaborated|Evaluated|Administered|Ensured|Handled|Performed|Served|Contributed|Identified|Initiated|Advised|Drafted|Researched|Assessed|Compiled|Generated|Presented|Utilized|Achieved|Exceeded|Drove|Transformed|Championed|Cultivated|Pioneered|Revamped|Orchestrated|Formulated|Devised|Instituted|Restructured|Consolidated|Integrated|Mobilized|Mentored|Fostered|Elevated|Amplified|Accelerated|Mitigated|Navigated|Diagnosed|Reconciled|Audited|Verified|Inspected|Calibrated|Configured|Deployed|Architected|Engineered|Programmed|Coded|Tested|Debugged|Migrated|Refactored|Authored|Published|Marketed|Promoted|Distributed|Negotiating|Managing|Leading|Building|Supporting|Developing)\b/i.test(t);
  const hasMetricOpener = /^\d/.test(t);
  const hasResultsLanguage = /\b(resulting in|which led to|saving|achieving|improving|reducing|increasing|generating|delivering|contributing|enabling|driving|growing|cutting|boosting|lowering|raising|expanding)\b/i.test(t);
  const hasCompleteStructure = t.length >= 60 && /[.!]$/.test(t);

  if (!hasActionVerb && !hasMetricOpener && !hasResultsLanguage && !hasCompleteStructure) {
    return FALLBACK_BULLET;
  }

  return t;
}

export default CalibratedBulletsSection;
