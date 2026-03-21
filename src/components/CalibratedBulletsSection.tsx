import { useMemo } from "react";
import { parseResumeIntake, type ExtractedExperience } from "@/lib/resumeIntake";
import EvidenceLedger from "@/components/EvidenceLedger";
import ResultSection from "@/components/ResultSection";
import { Button } from "@/components/ui/button";
import { antiAIFilter } from "@/lib/antiAIFilter";

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

/**
 * Parse the raw resume text into individual role bullets, then display
 * them alongside the calibrated variants. Never show the full raw resume
 * as a single "original bullet".
 */
const CalibratedBulletsSection = ({ bullet, result, effectiveIsPro, onUpgrade }: CalibratedBulletsSectionProps) => {
  // Parse the resume into structured roles with individual bullets
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

  // Extract top bullets across roles (max 5 most substantive)
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
    // Return top 5 most substantive bullets, preferring real text over fallbacks
    return bullets
      .sort((a, b) => {
        const aFallback = a.bullet === FALLBACK_BULLET ? 1 : 0;
        const bFallback = b.bullet === FALLBACK_BULLET ? 1 : 0;
        if (aFallback !== bFallback) return aFallback - bFallback;
        return b.bullet.length - a.bullet.length;
      })
      .slice(0, 5);
  }, [parsedRoles]);

  const evidenceEntries = result.signal_model?.evidence_ledger
    ?.filter(e => e.source === "resume")
    .slice(0, 2)
    .map(e => ({
      claim: e.evidence || e.claim,
      resume_snippet: e.evidence || e.claim,
      source_section: "Resume",
      confidence: "High" as const,
    }));

  // Error state — parser couldn't extract roles
  if (!parsedRoles || topBullets.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="section-label section-header">Calibrated Bullets</h3>
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <p className="text-sm text-muted-foreground">Could not extract individual bullets from your resume. Showing calibrated output only.</p>
        </div>
        {effectiveIsPro ? (
          <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-2">
            <p className="section-label text-primary">Variant A — Ownership Elevation</p>
            <p className="text-sm text-foreground leading-relaxed">{antiAIFilter(result.optimized_bullet)}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-primary/30 bg-card p-6 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">Calibrated bullet variants are a Pro feature</p>
            <p className="text-xs text-muted-foreground">Unlock repositioned bullet variants calibrated to this role's hiring signal.</p>
            {onUpgrade && (
              <Button size="sm" onClick={onUpgrade} className="mt-1">Unlock Full Signal Intelligence</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="section-label section-header">Calibrated Bullets</h3>

      {/* Individual parsed bullets — first 2 visible to all, 3-5 behind Pro gate */}
      {topBullets.slice(0, 2).map((item, i) => (
        <div key={i} className="rounded-xl border bg-card p-5 space-y-2">
          <div className="flex items-baseline gap-2">
             <p className="section-label">
              Original Bullet {topBullets.length > 1 ? `${i + 1}` : ""}
            </p>
            {(item.role || item.company) && (
              <span className="text-[10px] text-muted-foreground/60">
                {[item.role, item.company].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.bullet}</p>
        </div>
      ))}

      {/* Variant A — Ownership Elevation */}
      <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-2">
        <p className="section-label text-primary">Variant A — Ownership Elevation</p>
        <p className="text-sm text-foreground leading-relaxed">{antiAIFilter(result.optimized_bullet)}</p>
        <div className="pt-2 space-y-1">
          <p className="section-label">What changed</p>
          {(result.used_signals && result.used_signals.length > 0) ? (
            <ul className="space-y-0.5">
              {result.used_signals.map((s, i) => (
                <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">Clarified ownership language and aligned terminology with hiring expectations.</p>
          )}
        </div>
        <EvidenceLedger entries={evidenceEntries} />
      </div>

      {/* Bullets 3-5 + Variants B & C — Pro only */}
      {effectiveIsPro && (
        <>
          {topBullets.slice(2).map((item, i) => (
            <div key={`pro-${i}`} className="rounded-xl border bg-card p-5 space-y-2">
              <div className="flex items-baseline gap-2">
                <p className="section-label">
                  Original Bullet {i + 3}
                </p>
                {(item.role || item.company) && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {[item.role, item.company].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.bullet}</p>
            </div>
          ))}
          {result.alt_a !== result.optimized_bullet && (
            <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-2">
              <p className="section-label text-primary">Variant B — Outcome / Impact Framing</p>
              <p className="text-sm text-foreground leading-relaxed">{antiAIFilter(result.alt_a)}</p>
              <div className="pt-2 space-y-1">
                <p className="section-label">What changed</p>
                <ul className="space-y-0.5">
                  <li className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>Emphasized operational outcome</li>
                  <li className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>Aligned terminology with hiring expectations</li>
                </ul>
              </div>
              <EvidenceLedger entries={evidenceEntries} />
            </div>
          )}
          {result.alt_b !== result.optimized_bullet && result.alt_b !== result.alt_a && (
            <ResultSection title="Variant C — Strategic Depth Expansion" content={antiAIFilter(result.alt_b)} />
          )}
        </>
      )}

      <p className="context-text text-center pt-1">
        Repositioned using only language from your original resume. No experience was invented.
      </p>
    </div>
  );
};

const FALLBACK_BULLET = "Source bullet from uploaded resume";

/**
 * Validates a parsed bullet string. Returns cleaned text or the standard
 * fallback if the text looks like a garbled PDF fragment.
 */
function cleanBulletText(raw: string): string {
  const t = raw.trim();
  const words = t.split(/\s+/);

  // ── HARD REJECT: structural minimums ──
  if (t.length < 30 || words.length < 5) return FALLBACK_BULLET;

  // Must start with an uppercase letter or a digit
  if (!/^[A-Z0-9]/.test(t)) return FALLBACK_BULLET;

  // First word must not be a conjunction/preposition/article (mid-sentence fragment)
  const firstWordLower = words[0]?.toLowerCase().replace(/[^a-z]/g, "");
  const BAD_OPENERS = new Set([
    "and","or","but","nor","yet","so","for","with","from","into","through",
    "about","above","below","between","during","after","before","since","until",
    "the","a","an","to","of","in","on","at","by","as","is","was","were","are",
    "it","its","this","that","these","those","which","who","whom","whose",
  ]);
  if (BAD_OPENERS.has(firstWordLower)) return FALLBACK_BULLET;

  // ── HARD REJECT: non-experience content (education, location, contact, certs) ──

  // Education markers — reject regardless of length
  if (/\b(Bachelor|Master|Associate|Diploma|GPA|Dean.s List|Coursework|University|College|School|Degree|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D|High\s+School|Magna|Summa|Cum\s+Laude)\b/i.test(t)) return FALLBACK_BULLET;

  // Location patterns: "City · ST" or "City, ST" — ANY occurrence, not just short lines
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*[·]\s*[A-Z]{2}\b/.test(t)) return FALLBACK_BULLET;
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\b/.test(t) && t.length < 150) return FALLBACK_BULLET;

  // Contact contamination
  if (/\S+@\S+\.\S+/.test(t)) return FALLBACK_BULLET;
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(t)) return FALLBACK_BULLET;
  if (/https?:\/\//.test(t)) return FALLBACK_BULLET;
  if (/linkedin|github\.com/i.test(t)) return FALLBACK_BULLET;

  // Certification / award / membership line
  if (/\b(Certified|Certificate|Certification|License|Licensed|Award|Honor|Member|Membership)\b/i.test(t) && t.length < 100) return FALLBACK_BULLET;

  // Skills-list debris: high comma density
  const commas = (t.match(/,/g) || []).length;
  if (commas >= 3 && commas / words.length > 0.2) return FALLBACK_BULLET;

  // Multiple pipes / slashes / middots → header or skills row
  if ((t.match(/[|\/·]/g) || []).length >= 2) return FALLBACK_BULLET;

  // Mostly uppercase (section header debris)
  const upperChars = (t.match(/[A-Z]/g) || []).length;
  if (upperChars / t.length > 0.45 && t.length < 80) return FALLBACK_BULLET;

  // Concatenated skills blob
  const capsWords = words.filter(w => /^[A-Z][a-zA-Z]*$/.test(w) && w.length > 1).length;
  if (capsWords / words.length > 0.5 && words.length > 4) return FALLBACK_BULLET;

  // Date-heavy line (role header leaked in)
  const dateMatches = t.match(/\b(19|20)\d{2}\b/g);
  if (dateMatches && dateMatches.length >= 2 && t.length < 100) return FALLBACK_BULLET;

  // ── POSITIVE ALLOW GATE: must look like experience content ──
  // At least one of these signals must be present:
  const hasActionVerb = /^(Led|Managed|Owned|Built|Created|Developed|Designed|Implemented|Improved|Executed|Coordinated|Supported|Resolved|Reduced|Increased|Streamlined|Analyzed|Communicated|Partnered|Trained|Automated|Documented|Delivered|Oversaw|Directed|Established|Facilitated|Negotiated|Optimized|Spearheaded|Launched|Maintained|Monitored|Organized|Planned|Produced|Provided|Reported|Supervised|Tracked|Prepared|Reviewed|Conducted|Assisted|Processed|Collaborated|Evaluated|Administered|Ensured|Handled|Performed|Served|Contributed|Identified|Initiated|Advised|Drafted|Researched|Assessed|Compiled|Generated|Presented|Utilized|Achieved|Exceeded|Drove|Transformed|Championed|Cultivated|Pioneered|Revamped|Orchestrated|Formulated|Devised|Instituted|Restructured|Consolidated|Integrated|Mobilized|Mentored|Fostered|Elevated|Amplified|Accelerated|Mitigated|Navigated|Diagnosed|Reconciled|Audited|Verified|Inspected|Calibrated|Configured|Deployed|Architected|Engineered|Programmed|Coded|Tested|Debugged|Migrated|Refactored|Authored|Published|Marketed|Promoted|Distributed|Negotiating|Managing|Leading|Building|Supporting|Developing)\b/i.test(t);
  const hasMetricOpener = /^\d/.test(t); // starts with a number (metric-led bullet)
  const hasResultsLanguage = /\b(resulting in|which led to|saving|achieving|improving|reducing|increasing|generating|delivering|contributing|enabling|driving|growing|cutting|boosting|lowering|raising|expanding)\b/i.test(t);
  const hasCompleteStructure = t.length >= 60 && /[.!]$/.test(t); // complete sentence

  if (!hasActionVerb && !hasMetricOpener && !hasResultsLanguage && !hasCompleteStructure) {
    return FALLBACK_BULLET;
  }

  return t;
}

export default CalibratedBulletsSection;
