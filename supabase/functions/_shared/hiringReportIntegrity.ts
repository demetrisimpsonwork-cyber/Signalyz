/**
 * Hiring Report integrity gates — pure, no Deno/Node APIs.
 * Ensures Export Builder obeys Consistency Validator and blocks JD-as-resume fabrications.
 */

export interface ExportChangeDiff {
  original_bullet: string;
  revised_bullet: string;
  gap_fixed: string;
}

export interface RejectedExportChange extends ExportChangeDiff {
  rejection_reason: string;
}

export interface ConsistencyValidatorSnapshot {
  status: "pass" | "revise";
  issues: string[];
}

export interface GatedExportBuilder {
  final_resume_text: string;
  changes_diff: ExportChangeDiff[];
  rejected_changes: RejectedExportChange[];
}

export interface RewriteTargetLike {
  bullet_reference: string;
  upgrade_type?: string;
  reason?: string;
  version_a?: string | null;
  version_b?: string | null;
  rewritten_bullet?: string | null;
  validator_status?: "approved" | "rejected";
  rejection_reason?: string;
}

const VALIDATOR_REJECTION_MARKERS =
  /\b(fabricat|unsupported|unverifiable|not supported|cannot be verified|no evidence|invented|implausible|exceeds|misrepresent|not present in|not found in|contradict)\b/i;

const JD_TASK_PHRASES =
  /\b(modify and\/or enhance|with guidance from a supervisor|small scale|job description|responsibilities include|qualifications include|you will|must be able to)\b/i;

const TECHNICAL_HARD_SKILL_RULES: Array<{ label: string; signalRx: RegExp; resumeRx: RegExp }> = [
  { label: "SDLC", signalRx: /\b(sdlc|software development lifecycle)\b/i, resumeRx: /\b(sdlc|software development lifecycle|agile|scrum|sprint|devops|ci\/cd)\b/i },
  { label: "unit testing", signalRx: /\bunit test/i, resumeRx: /\bunit test|\bjest\b|\bmocha\b|\bpytest\b|\bxunit\b/i },
  { label: "integration testing", signalRx: /\bintegration test/i, resumeRx: /\bintegration test|\be2e test|\bend-to-end test/i },
  { label: "RESTful API", signalRx: /\brestful api\b|\brest api\b/i, resumeRx: /\b(restful api|rest api|\bapi\b|endpoint|graphql)\b/i },
  { label: "programming languages", signalRx: /\bprogramming language/i, resumeRx: /\b(python|java|javascript|typescript|c\+\+|c#|go\b|rust|ruby|kotlin|swift|programming|code|coding)\b/i },
  { label: "cloud AI services", signalRx: /\bcloud ai\b|\bai service/i, resumeRx: /\b(aws|azure|gcp|openai|bedrock|vertex ai|cloud ai|lambda|sagemaker)\b/i },
  { label: "application administration", signalRx: /\bapplication admin/i, resumeRx: /\b(application admin|system admin|server admin|deploy|deployment|configuration|prod support)\b/i },
  { label: "database concepts", signalRx: /\bdatabase concept|\bsql\b/i, resumeRx: /\b(sql|postgres|mysql|database|schema|query|mongodb|redis)\b/i },
  { label: "n-tier architecture", signalRx: /\bn-?tier|\btiered architecture\b/i, resumeRx: /\b(n-?tier|multi-tier|tiered architecture|frontend.*backend|presentation layer|data layer|service layer|microservice)\b/i },
  { label: "software engineering", signalRx: /\bsoftware engineer|\bsoftware development\b/i, resumeRx: /\b(software engineer|developer|programming|codebase|repository|git\b|pull request)\b/i },
];

const CUSTOMER_SERVICE_ONLY_RX =
  /\b(customer service|call center|claims|escalation|phone support|email support|unemployment|benefits|compliance|intake|de-escalation|claimant|supervisor|tier-2)\b/i;

const TECHNICAL_CONSTRUCTION_RX =
  /\b(code|coding|program|programming|python|java|javascript|typescript|sql|database|api|deploy|deployment|unit test|integration test|git\b|github|framework|backend|frontend|microservice|architecture|repository|pull request)\b/i;

const ATOMIC_LABEL_RULES: Array<{ rx: RegExp; label: string }> = [
  { rx: /\bsoftware development lifecycle\b|\bsdlc\b/i, label: "SDLC" },
  { rx: /\bunit test/i, label: "unit testing" },
  { rx: /\bintegration test/i, label: "integration testing" },
  { rx: /\brestful api\b|\brest api\b/i, label: "RESTful API" },
  { rx: /\bprogramming language/i, label: "programming languages" },
  { rx: /\bcloud ai\b|\bai service/i, label: "cloud AI services" },
  { rx: /\bapplication admin/i, label: "application administration" },
  { rx: /\bdatabase concept/i, label: "database concepts" },
  { rx: /\bn-?tier|\btiered architecture\b/i, label: "n-tier architecture" },
];

const TECHNICAL_ROLE_RX =
  /\b(software engineer|developer|full stack|backend engineer|frontend engineer|devops|sre|platform engineer|ml engineer|data engineer)\b/i;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function significantTokens(text: string): string[] {
  return (normalizeText(text).match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 4);
}

/** Normalize long assessment sentences to short atomic gap labels. */
export function normalizeAtomicGapLabel(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return trimmed;

  for (const rule of ATOMIC_LABEL_RULES) {
    if (rule.rx.test(trimmed)) return rule.label;
  }

  if (trimmed.length <= 48 && !/\b(is not|was not|no evidence|not present|cannot)\b/i.test(trimmed)) {
    return trimmed.replace(/\.$/, "");
  }

  const firstClause = trimmed.split(/[.;]/)[0]?.trim() ?? trimmed;
  for (const rule of ATOMIC_LABEL_RULES) {
    if (rule.rx.test(firstClause)) return rule.label;
  }

  if (firstClause.length <= 48) return firstClause.replace(/\.$/, "");

  const words = firstClause.split(/\s+/).slice(0, 6).join(" ");
  return words.replace(/\.$/, "");
}

export function isTechnicalRoleContext(jdText?: string | null, roleTitle?: string | null): boolean {
  const text = `${roleTitle ?? ""}\n${jdText ?? ""}`;
  return TECHNICAL_ROLE_RX.test(text);
}

export function isTechnicalHardSkillSignal(signal: string): boolean {
  return TECHNICAL_HARD_SKILL_RULES.some((rule) => rule.signalRx.test(signal));
}

export function matchingTechnicalHardSkill(signal: string): typeof TECHNICAL_HARD_SKILL_RULES[number] | null {
  return TECHNICAL_HARD_SKILL_RULES.find((rule) => rule.signalRx.test(signal)) ?? null;
}

export function hasTechnicalConstructionEvidence(resumeText: string): boolean {
  return TECHNICAL_CONSTRUCTION_RX.test(resumeText);
}

/** True when resume evidence is primarily customer service / claims / support — not engineering. */
export function isCustomerServiceDominantEvidence(resumeText: string): boolean {
  const lower = normalizeText(resumeText);
  const csHits = (lower.match(new RegExp(CUSTOMER_SERVICE_ONLY_RX.source, "gi")) || []).length;
  const techHits = (lower.match(new RegExp(TECHNICAL_CONSTRUCTION_RX.source, "gi")) || []).length;
  return csHits >= 2 && techHits === 0;
}

/** Customer service evidence must not support technical hard-skill transfer. */
export function canTechnicalSignalTransferFromResume(signal: string, resumeText: string): boolean {
  const rule = matchingTechnicalHardSkill(signal);
  if (!rule) return true;
  if (!resumeText.trim()) return false;
  if (isCustomerServiceDominantEvidence(resumeText) && !rule.resumeRx.test(resumeText)) return false;
  return rule.resumeRx.test(resumeText);
}

/** Do not mark n-tier / architecture present from vague AI-product wording alone. */
export function hasSupportedTechnicalPresence(signal: string, resumeText: string): boolean {
  const rule = matchingTechnicalHardSkill(signal);
  if (!rule) return true;
  if (rule.label === "n-tier architecture") {
    if (/\bai-powered\b/i.test(resumeText) && !rule.resumeRx.test(resumeText)) return false;
  }
  return rule.resumeRx.test(resumeText);
}

/** Detect JD requirement lines masquerading as resume bullets. */
export function isJdSourcedBullet(bullet: string, jdText: string, resumeText: string): boolean {
  const b = normalizeText(bullet);
  if (b.length < 25) return false;

  const jd = normalizeText(jdText);
  const resume = normalizeText(resumeText);
  if (!jd) return false;

  if (JD_TASK_PHRASES.test(bullet) && jd.includes(b.slice(0, Math.min(b.length, 80)))) return true;

  if (jd.includes(b) && !resume.includes(b)) return true;

  const tokens = significantTokens(b);
  if (tokens.length < 4) return false;

  const inJd = tokens.filter((t) => jd.includes(t)).length / tokens.length;
  const inResume = tokens.filter((t) => resume.includes(t)).length / tokens.length;
  return inJd >= 0.72 && inResume < 0.35;
}

function overlapSnippet(a: string, b: string, minLen = 24): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const snippet = left.slice(0, Math.max(minLen, Math.floor(left.length * 0.45)));
  return snippet.length >= minLen && right.includes(snippet);
}

export function isBulletMentionedInValidatorIssues(
  bullet: string,
  revised: string,
  issues: string[],
): boolean {
  if (!issues.length) return false;
  return issues.some((issue) => {
    if (!VALIDATOR_REJECTION_MARKERS.test(issue)) return false;
    return overlapSnippet(issue, bullet) || overlapSnippet(issue, revised);
  });
}

export function gateExportBuilderChanges(input: {
  changes_diff: ExportChangeDiff[];
  final_resume_text: string;
  validator: ConsistencyValidatorSnapshot | null;
  resumeText: string;
  jdText?: string;
}): GatedExportBuilder {
  const approved: ExportChangeDiff[] = [];
  const rejected: RejectedExportChange[] = [];

  for (const diff of input.changes_diff) {
    let rejection_reason: string | null = null;

    if (isJdSourcedBullet(diff.original_bullet, input.jdText ?? "", input.resumeText)) {
      rejection_reason = "Original bullet appears to be JD language, not resume source evidence.";
    } else if (
      input.validator &&
      isBulletMentionedInValidatorIssues(
        diff.original_bullet,
        diff.revised_bullet,
        input.validator.issues,
      )
    ) {
      rejection_reason = "Consistency Validator flagged this rewrite as unsupported or unverifiable.";
    }

    if (rejection_reason) {
      rejected.push({ ...diff, rejection_reason });
    } else {
      approved.push({
        ...diff,
        gap_fixed: normalizeAtomicGapLabel(diff.gap_fixed),
      });
    }
  }

  let finalText = input.final_resume_text || input.resumeText;
  for (const rej of rejected) {
    if (rej.revised_bullet && finalText.includes(rej.revised_bullet)) {
      finalText = finalText.split(rej.revised_bullet).join(rej.original_bullet);
    }
  }

  return {
    final_resume_text: finalText,
    changes_diff: approved,
    rejected_changes: rejected,
  };
}

export function gateRewriteTargets(input: {
  rewrite_targets: RewriteTargetLike[];
  validator: ConsistencyValidatorSnapshot | null;
  resumeText: string;
  jdText?: string;
}): RewriteTargetLike[] {
  return input.rewrite_targets.map((target) => {
    const revised =
      target.version_b || target.version_a || target.rewritten_bullet || "";
    let rejection_reason: string | null = null;

    if (isJdSourcedBullet(target.bullet_reference, input.jdText ?? "", input.resumeText)) {
      rejection_reason = "Bullet reference appears to be JD language, not resume evidence.";
    } else if (
      input.validator &&
      revised &&
      isBulletMentionedInValidatorIssues(target.bullet_reference, revised, input.validator.issues)
    ) {
      rejection_reason = "Consistency Validator flagged this rewrite as unsupported.";
    }

    if (!rejection_reason) {
      return { ...target, validator_status: "approved" as const };
    }

    return {
      ...target,
      validator_status: "rejected" as const,
      rejection_reason,
      version_a: null,
      version_b: null,
      rewritten_bullet: null,
    };
  });
}

export function normalizeGapLabelList(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const atomic = normalizeAtomicGapLabel(label);
    const key = atomic.toLowerCase();
    if (!atomic || seen.has(key)) continue;
    seen.add(key);
    out.push(atomic);
  }
  return out;
}

/** Collapse repetitive "no evidence" phrasing across report sections. */
export function dedupeRepetitiveWarnings(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = normalizeText(line).replace(/\bno evidence\b/g, "no_evidence");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export interface HiringReportIntegrityInput {
  experience: string;
  jd?: string;
  consistency_validator?: ConsistencyValidatorSnapshot | null;
  export_builder?: {
    final_resume_text: string;
    changes_diff: ExportChangeDiff[];
    rejected_changes?: RejectedExportChange[];
  } | null;
  gap_analyzer?: {
    priority_order?: string[];
    rewrite_targets?: RewriteTargetLike[];
  } | null;
  signal_classifier?: {
    top_3_gaps?: string[];
    dimension_scores?: Record<string, { missing?: string[]; gap?: string; gap_label?: string }>;
  } | null;
  pattern_detection?: {
    undersignaling_patterns?: string[];
    ownership_inflation_patterns?: string[];
  } | null;
}

export function applyHiringReportIntegrityGate<T extends HiringReportIntegrityInput>(
  result: T,
  experience: string,
  jd = "",
): T {
  const resumeText = experience ?? "";
  const jdText = jd ?? "";
  const validator = result.consistency_validator ?? null;

  if (result.gap_analyzer?.rewrite_targets) {
    result.gap_analyzer.rewrite_targets = gateRewriteTargets({
      rewrite_targets: result.gap_analyzer.rewrite_targets,
      validator,
      resumeText,
      jdText,
    });
  }

  if (result.export_builder) {
    const gated = gateExportBuilderChanges({
      changes_diff: result.export_builder.changes_diff ?? [],
      final_resume_text: result.export_builder.final_resume_text ?? resumeText,
      validator,
      resumeText,
      jdText,
    });
    result.export_builder = {
      ...result.export_builder,
      final_resume_text: gated.final_resume_text,
      changes_diff: gated.changes_diff,
      rejected_changes: gated.rejected_changes,
    };
  }

  if (result.signal_classifier) {
    if (Array.isArray(result.signal_classifier.top_3_gaps)) {
      result.signal_classifier.top_3_gaps = normalizeGapLabelList(result.signal_classifier.top_3_gaps);
    }
    if (result.signal_classifier.dimension_scores) {
      for (const dim of Object.values(result.signal_classifier.dimension_scores)) {
        if (Array.isArray(dim.missing)) {
          dim.missing = normalizeGapLabelList(dim.missing);
        }
        if (dim.gap) dim.gap = normalizeAtomicGapLabel(dim.gap);
        if (dim.gap_label) dim.gap_label = normalizeAtomicGapLabel(dim.gap_label);
      }
    }
  }

  if (result.pattern_detection) {
    result.pattern_detection.undersignaling_patterns = dedupeRepetitiveWarnings(
      result.pattern_detection.undersignaling_patterns ?? [],
    );
    result.pattern_detection.ownership_inflation_patterns = dedupeRepetitiveWarnings(
      result.pattern_detection.ownership_inflation_patterns ?? [],
    );
  }

  return result;
}

export const HIRING_REPORT_TRUST_COPY =
  "Built from your real experience — no invented employers, titles, or credentials. Designed to avoid unsupported claims.";
