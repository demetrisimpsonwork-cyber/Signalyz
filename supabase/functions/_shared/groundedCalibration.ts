export interface EvidencePackageItem {
  evidence_id: string;
  content: string;
  section: string;
  company: string;
  role_title: string;
  similarity: number;
}

export interface CalibratedBulletRecord {
  text: string;
  original_bullet?: string;
  variant?: string;
  used_evidence: EvidencePackageItem[];
  grounding_status: GroundingStatus;
}

export type GroundingStatus = "grounded" | "low_confidence" | "ungrounded_blocked";

export const LOW_EVIDENCE_SIMILARITY_THRESHOLD = 0.55;
export const GROUNDED_EVIDENCE_SIMILARITY_THRESHOLD = 0.65;

const METRIC_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:%|percent|percentage|k|m|b|million|billion|thousand)\b|\$\s?\d[\d,.]*|\b\d{2,}\+?\b/gi;

const COMMON_TOOL_TOKENS = [
  "salesforce",
  "sap",
  "hubspot",
  "zendesk",
  "servicenow",
  "jira",
  "tableau",
  "power bi",
  "excel",
  "slack",
  "teams",
  "workday",
  "oracle",
  "netsuite",
  "quickbooks",
  "github",
  "aws",
  "azure",
  "gcp",
  "sql",
  "python",
  "java",
  "javascript",
  "typescript",
];

export function normalizeEvidencePackage(
  items: EvidencePackageItem[] | undefined | null,
): EvidencePackageItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: EvidencePackageItem[] = [];

  for (const item of items) {
    if (!item?.content?.trim()) {
      continue;
    }

    const evidenceId = item.evidence_id || `${item.section}:${item.company}:${item.content.slice(0, 24)}`;
    if (seen.has(evidenceId)) {
      continue;
    }

    seen.add(evidenceId);
    normalized.push({
      evidence_id: evidenceId,
      content: item.content.trim(),
      section: item.section || "unknown",
      company: item.company || "",
      role_title: item.role_title || "",
      similarity: typeof item.similarity === "number" ? item.similarity : 0,
    });
  }

  return normalized.sort((a, b) => b.similarity - a.similarity);
}

export function buildEvidencePromptBlock(params: {
  evidence: EvidencePackageItem[];
  originalBullet: string;
  jd: string;
  missingSignal?: string | null;
}): string {
  const evidence = normalizeEvidencePackage(params.evidence);
  const originalBullet = params.originalBullet.trim();
  const jd = params.jd.trim();
  const missingSignal = params.missingSignal?.trim() || "";

  if (evidence.length === 0) {
    return `
GROUNDED REWRITE CONTEXT:
- No retrieved resume evidence was available for this run.
- Rewrite ONLY using facts present in the ORIGINAL BULLET and TARGET JD language.
- Do NOT add metrics, tools, scope claims, or responsibilities not explicitly supported.
- If uncertain, produce a conservative rephrase of the original bullet without expansion.
`.trim();
  }

  const evidenceLines = evidence
    .slice(0, 8)
    .map(
      (item, index) =>
        `${index + 1}. [${item.section}${item.company ? ` | ${item.company}` : ""}] (sim=${item.similarity.toFixed(3)})\n${item.content}`,
    )
    .join("\n\n");

  return `
GROUNDED REWRITE CONTEXT (STRICT):
You may ONLY rewrite using facts present in:
1) ORIGINAL BULLET
2) RETRIEVED RESUME EVIDENCE below
3) TARGET JD language (for framing only — never invent experience from JD requirements)

ORIGINAL BULLET:
${originalBullet || "(not provided)"}

TARGET JD EXCERPT:
${jd.slice(0, 1200)}

${missingSignal ? `MISSING SIGNAL TO ADDRESS:\n${missingSignal}\n` : ""}
RETRIEVED RESUME EVIDENCE:
${evidenceLines}

STRICT GROUNDING RULES:
- Do NOT invent tools, metrics, systems, team sizes, dollar amounts, or scope not supported by the original bullet or retrieved evidence.
- If evidence confidence is weak, produce a conservative rewrite only: no new metrics, no new tools, no new scope claims.
- Prefer reframing existing facts over adding detail.
`.trim();
}

function tokenizeCorpus(parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function extractMetrics(text: string): string[] {
  return (text.match(METRIC_PATTERN) || []).map((value) => value.toLowerCase());
}

export function extractToolMentions(text: string): string[] {
  const lower = text.toLowerCase();
  return COMMON_TOOL_TOKENS.filter((tool) => lower.includes(tool));
}

export function findUnsupportedMetrics(calibratedText: string, allowedCorpus: string): string[] {
  const allowed = tokenizeCorpus([allowedCorpus]);
  return extractMetrics(calibratedText).filter((metric) => !allowed.includes(metric));
}

export function findUnsupportedTools(calibratedText: string, allowedCorpus: string): string[] {
  const allowed = tokenizeCorpus([allowedCorpus]);
  return extractToolMentions(calibratedText).filter((tool) => !allowed.includes(tool));
}

export function computeGroundingStatus(params: {
  evidence: EvidencePackageItem[];
  calibratedText: string;
  originalBullet: string;
  jd: string;
}): GroundingStatus {
  const evidence = normalizeEvidencePackage(params.evidence);
  const allowedCorpus = [
    params.originalBullet,
    params.jd,
    ...evidence.map((item) => item.content),
  ].join("\n");

  const unsupportedMetrics = findUnsupportedMetrics(params.calibratedText, allowedCorpus);
  const unsupportedTools = findUnsupportedTools(params.calibratedText, allowedCorpus);

  if (unsupportedMetrics.length > 0 || unsupportedTools.length > 0) {
    return "ungrounded_blocked";
  }

  const topSimilarity = evidence[0]?.similarity ?? 0;
  if (evidence.length === 0 || topSimilarity < LOW_EVIDENCE_SIMILARITY_THRESHOLD) {
    return "low_confidence";
  }

  return "grounded";
}

export function applyConservativeRewrite(calibratedText: string, originalBullet: string): string {
  let text = calibratedText.trim();
  if (!text) {
    return originalBullet.trim();
  }

  text = text.replace(METRIC_PATTERN, "").replace(/\s{2,}/g, " ").trim();

  for (const tool of COMMON_TOOL_TOKENS) {
    const originalHasTool = originalBullet.toLowerCase().includes(tool);
    if (!originalHasTool) {
      const pattern = new RegExp(`\\b${tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      text = text.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
    }
  }

  text = text
    .replace(/\b(leading to|resulting in|which (?:led|resulted) in)\s+[,.]?/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();

  if (text.length < 20) {
    return originalBullet.trim();
  }

  return text;
}

export function selectUsedEvidence(
  evidence: EvidencePackageItem[],
  calibratedText: string,
  maxItems = 3,
): EvidencePackageItem[] {
  const lower = calibratedText.toLowerCase();
  const matched = evidence.filter((item) => {
    const words = item.content.toLowerCase().split(/\s+/).filter((word) => word.length > 5);
    return words.some((word) => lower.includes(word));
  });

  const pool = matched.length > 0 ? matched : evidence.slice(0, maxItems);
  return pool.slice(0, maxItems);
}

export function buildCalibratedBulletRecords(params: {
  optimizedBullets: Array<{ text?: string; variant?: string }>;
  originalBullet: string;
  evidence: EvidencePackageItem[];
  jd: string;
}): CalibratedBulletRecord[] {
  const evidence = normalizeEvidencePackage(params.evidence);
  const originalBullet = params.originalBullet.trim();
  const jd = params.jd.trim();

  return params.optimizedBullets
    .map((bullet, index) => {
      const rawText = (bullet.text || "").trim();
      if (!rawText) {
        return null;
      }

      let text = rawText;
      let status = computeGroundingStatus({
        evidence,
        calibratedText: text,
        originalBullet,
        jd,
      });

      if (status === "ungrounded_blocked") {
        text = applyConservativeRewrite(text, originalBullet);
        status = computeGroundingStatus({
          evidence,
          calibratedText: text,
          originalBullet,
          jd,
        });
        if (status === "ungrounded_blocked") {
          text = originalBullet;
          status = "low_confidence";
        }
      } else if (status === "low_confidence") {
        text = applyConservativeRewrite(text, originalBullet);
      }

      return {
        text,
        original_bullet: originalBullet || undefined,
        variant: bullet.variant || (index === 0 ? "primary" : `variant_${index}`),
        used_evidence: selectUsedEvidence(evidence, text),
        grounding_status: status,
      };
    })
    .filter((record): record is CalibratedBulletRecord => record !== null);
}

export function mapClientEvidenceToPackage(
  matches: Array<{
    id: string;
    content: string;
    similarity: number;
    metadata?: Record<string, unknown>;
  }>,
): EvidencePackageItem[] {
  return normalizeEvidencePackage(
    matches.map((match) => ({
      evidence_id: match.id,
      content: match.content,
      section: String(match.metadata?.section ?? "unknown"),
      company: String(match.metadata?.company ?? ""),
      role_title: String(match.metadata?.role_title ?? ""),
      similarity: match.similarity,
    })),
  );
}
