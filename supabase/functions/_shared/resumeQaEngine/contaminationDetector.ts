import type { DetectorContext, QaIssue } from "./types.ts";
import { buildIssue } from "./issueFactory.ts";
import {
  classifyContaminationPhrase,
  isArtifactContaminationSubtype,
  RESUME_SECTION_LABELS,
} from "./contaminationArtifactClassifier.ts";
import {
  explainPhrasePresence,
  isKnownContamination,
  isTransferableRewrite,
  normalizePhrase,
  phraseMatchesCorpus,
} from "./synonymGraph.ts";

/** Distinctive phrases in generated text absent from source + JD + transferable rewrite. */
export function detectCrossJdContamination(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const candidates = extractContaminationCandidates(ctx.generatedResumeText);

  for (const phrase of candidates) {
    const normalized = normalizePhrase(phrase);
    if (normalized.length < 4) continue;
    if (RESUME_SECTION_LABELS.has(normalized)) continue;

    const presence = explainPhrasePresence(phrase, ctx.sourceCorpus, ctx.jdCorpus);
    if (presence.inSource || presence.inJd || presence.transferable || presence.synonymMatched) {
      continue;
    }
    if (isTransferableRewrite(phrase)) continue;
    if (phraseMatchesCorpus(phrase, ctx.referenceCorpus)) continue;

    const knownBad = isKnownContamination(phrase);
    const subtype = classifyContaminationPhrase(phrase, { knownSignature: knownBad });

    if (subtype === "normal_resume_phrase") continue;

    const { confidence, ruleId, proposedSeverity } = resolveContaminationSeverity(
      subtype,
      phrase,
      presence,
      knownBad,
    );

    if (confidence === "low") continue;

    issues.push(
      buildIssue({
        ruleId,
        detector: "contamination",
        code: "cross_jd_contamination",
        confidence,
        matchedTerms: [normalized],
        source: "generated_resume",
        message: artifactMessage(subtype),
        suggestedFix: artifactSuggestedFix(subtype),
        evidence: phrase,
        proposedSeverity,
        contaminationSubtype: subtype,
      }),
    );
  }

  return dedupeIssues(issues);
}

function resolveContaminationSeverity(
  subtype: ReturnType<typeof classifyContaminationPhrase>,
  phrase: string,
  presence: ReturnType<typeof explainPhrasePresence>,
  knownBad: boolean,
): {
  confidence: "very_high" | "high" | "medium" | "low";
  ruleId: string;
  proposedSeverity: "critical" | "high" | "medium" | "low";
} {
  if (subtype === "known_signature") {
    return {
      confidence: "very_high",
      ruleId: "contamination.known_signature",
      proposedSeverity: "critical",
    };
  }

  if (isArtifactContaminationSubtype(subtype)) {
    return {
      confidence: subtype === "unclear" ? "medium" : "low",
      ruleId: "contamination.section_artifact",
      proposedSeverity: "medium",
    };
  }

  if (subtype === "true_contamination") {
    const norm = normalizePhrase(phrase);
    if (/sandbox|pilot program|internal codename/i.test(norm)) {
      return {
        confidence: "very_high",
        ruleId: "contamination.ungrounded_phrase",
        proposedSeverity: "critical",
      };
    }
    if (/\b[a-z]{2,}\s[a-z]{4,}\b/.test(norm) && norm.split(" ").length >= 2) {
      return {
        confidence: "high",
        ruleId: "contamination.ungrounded_phrase",
        proposedSeverity: "critical",
      };
    }
    if (/^[a-z]+ [a-z]+$/i.test(phrase.trim())) {
      return {
        confidence: "medium",
        ruleId: "contamination.advisory_phrase",
        proposedSeverity: "medium",
      };
    }
  }

  return { confidence: "low", ruleId: "contamination.advisory_phrase", proposedSeverity: "low" };
}

function artifactMessage(subtype: ReturnType<typeof classifyContaminationPhrase>): string {
  if (isArtifactContaminationSubtype(subtype)) {
    return "Contamination artifact from section/header parsing — advisory only, not cross-JD leakage.";
  }
  return "Cross-JD contamination: phrase not grounded in source resume, JD, or transferable rewrite.";
}

function artifactSuggestedFix(subtype: ReturnType<typeof classifyContaminationPhrase>): string {
  if (isArtifactContaminationSubtype(subtype)) {
    return "No action required — parser artifact; monitor only in shadow mode.";
  }
  return "Remove ungrounded phrase or anchor it to source/JD facts.";
}

/**
 * Mine candidates line-by-line so location tokens (e.g. "NJ") on the contact line
 * are never joined with the following "Summary" section header.
 */
function extractContaminationCandidates(text: string): string[] {
  const phrases = new Set<string>();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const acronymPairs = trimmed.match(/\b[A-Z]{2,} [A-Z][a-z]+(?: [A-Z][a-z]+)?\b/g) ?? [];
    for (const p of acronymPairs) phrases.add(p.trim());
  }

  const quoted = text.match(/"([^"]{3,60})"/g) ?? [];
  for (const q of quoted) phrases.add(q.replace(/"/g, "").trim());

  const flat = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  for (const bad of ["AI Sandbox", "ai sandbox"]) {
    if (flat.toLowerCase().includes(bad.toLowerCase())) phrases.add("AI Sandbox");
  }

  return [...phrases];
}

function dedupeIssues(issues: QaIssue[]): QaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.ruleId}:${(i.matchedTerms ?? []).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
