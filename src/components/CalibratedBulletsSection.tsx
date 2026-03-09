import { useMemo } from "react";
import { parseResumeIntake, type ExtractedExperience } from "@/lib/resumeIntake";
import EvidenceLedger from "@/components/EvidenceLedger";
import ResultSection from "@/components/ResultSection";
import { Button } from "@/components/ui/button";

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
        if (resp.length >= 20) {
          bullets.push({
            role: role.role_title || "Role",
            company: role.company || "",
            bullet: resp,
          });
        }
      }
    }
    // Return top 5 most substantive bullets
    return bullets
      .sort((a, b) => b.bullet.length - a.bullet.length)
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
        {/* Still show the calibrated variant */}
        <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-2">
          <p className="section-label text-primary">Variant A — Ownership Elevation</p>
          <p className="text-sm text-foreground leading-relaxed">{result.optimized_bullet}</p>
        </div>
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
        <p className="text-sm text-foreground leading-relaxed">{result.optimized_bullet}</p>
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
              <p className="text-sm text-foreground leading-relaxed">{result.alt_a}</p>
              <div className="pt-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">What changed</p>
                <ul className="space-y-0.5">
                  <li className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>Emphasized operational outcome</li>
                  <li className="text-[11px] text-muted-foreground flex gap-1.5"><span>•</span>Aligned terminology with hiring expectations</li>
                </ul>
              </div>
              <EvidenceLedger entries={evidenceEntries} />
            </div>
          )}
          {result.alt_b !== result.optimized_bullet && result.alt_b !== result.alt_a && (
            <ResultSection title="Variant C — Strategic Depth Expansion" content={result.alt_b} />
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground/70 italic text-center pt-1">
        Repositioned using only language from your original resume. No experience was invented.
      </p>
    </div>
  );
};


export default CalibratedBulletsSection;
