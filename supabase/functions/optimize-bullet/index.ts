import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_SONNET_MODEL } from "../_shared/anthropicModel.ts";
import {
  DAILY_FREE_ALIGNMENT_LIMIT,
  getAlignmentUsageCount,
  getUserIdFromRequest,
  guestEntitlements,
  incrementAlignmentUsage,
  isValidSessionToken,
  loadUserEntitlements,
} from "../_shared/entitlements.ts";
import {
  extractCanonicalRunContext,
  reportRunAccessJsonResponse,
  resolveReportRunAccess,
} from "../_shared/reportRunAccess.ts";
import {
  buildAlignmentUsageIdentity,
  entitlementJsonResponse,
  evaluateGuestAlignmentSession,
  evaluateOptimizeBulletAccess,
  shouldConsumeOneTimeCredit,
} from "../_shared/entitlementGuard.ts";
import {
  buildCalibratedBulletRecords,
  buildEvidencePromptBlock,
  normalizeEvidencePackage,
  type EvidencePackageItem,
} from "../_shared/groundedCalibration.ts";
import {
  buildSlimAlignmentPrompt,
  FREE_TIER_MAX_TOKENS,
  PRO_TIER_MAX_TOKENS,
  splitScoreRationale,
} from "../_shared/optimizeBulletSlimContract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// â”€â”€â”€ Input limits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MAX_RESUME_CHARS = 10000;
const MAX_JD_CHARS = 8000;
const MAX_COMBINED_CHARS = 16000;
const MIN_RESUME_CHARS = 20;
const MIN_JD_CHARS = 20;

const DETERMINISTIC_SYSTEM = `You are a deterministic analysis engine. Your outputs must be perfectly reproducible.

EXTRACTION RULES:
- Extract the same priority signals every time for the same input. Your extraction must be reproducible.
- List signals in consistent priority order based on frequency and emphasis in the source text.
- Extract the same experience signals every time for the same input. Do not vary which signals you surface based on phrasing flexibility.
- When identifying keywords, scan the full text systematically from top to bottom. Do not skip or reorder based on salience impressions.

SCORING RULES:
- You are a deterministic scorer. The inputs you are scoring were extracted deterministically. You must return the same score for the same inputs every time.
- Anchor to your first assessment and do not vary it.
- If you are uncertain between two values, anchor to the lower bound and hold it.
- Use explicit evidence counting, not subjective impression, for every numeric field.

OUTPUT RULES:
- Return only valid JSON. No markdown, no code fences, no preamble, no explanation.
- Start your response with { and end with }.`;

interface CallAIResult {
  content: string;
  stop_reason: string | null;
  output_tokens: number | null;
  input_tokens: number | null;
}

async function callAI(apiKey: string, prompt: string, maxTokens = 3500): Promise<CallAIResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 120s for cold starts
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_SONNET_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        system: DETERMINISTIC_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timeout);
    console.log("Anthropic status:", aiRes.status);
    if (aiRes.ok) {
      const data = await aiRes.json();
      const content = data.content?.[0]?.text || "";
      if (content) {
        return {
          content,
          stop_reason: typeof data.stop_reason === "string" ? data.stop_reason : null,
          output_tokens: typeof data.usage?.output_tokens === "number" ? data.usage.output_tokens : null,
          input_tokens: typeof data.usage?.input_tokens === "number" ? data.usage.input_tokens : null,
        };
      }
      throw new Error("Anthropic returned empty content.");
    }
    const errBody = await aiRes.text();
    console.error("Anthropic error:", aiRes.status, errBody);
    try {
      const parsed = JSON.parse(errBody);
      throw new Error(`Anthropic ${aiRes.status}: ${parsed.error?.message || errBody}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Anthropic")) throw parseErr;
      throw new Error(`Anthropic ${aiRes.status}: ${errBody.slice(0, 300)}`);
    }
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.message.startsWith("Anthropic")) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) throw new Error("Anthropic request timed out after 120s.");
    throw new Error(`AI call failed: ${msg}`);
  }
}

function extractJSON(raw: string): Record<string, unknown> {
  // Strip all markdown code fences (anywhere in the string, multiline)
  let stripped = raw.replace(/```(?:json)?\s*/gi, "").trim();

  // Try direct parse first
  try {
    return JSON.parse(stripped);
  } catch { /* fall through */ }

  // Find outermost { ... }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("JSON_EXTRACT_FAIL");
  }

  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new Error("JSON_EXTRACT_FAIL");
  }
}

// â”€â”€â”€ Input normalization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function normalizeText(input: string): string {
  return input
    // Remove null bytes and unusual control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Collapse repeated whitespace (preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripResumeHeader(text: string): string {
  const lines = text.split("\n");
  let skipUntil = 0;
  // Heuristic: skip leading lines that look like name/email/phone/address (up to 6 lines)
  const headerPatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,                    // "John Smith"
    /\b[\w.-]+@[\w.-]+\.\w{2,}\b/,                     // email
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,            // phone
    /^\d+\s+\w+\s+(street|st|ave|avenue|blvd|rd|dr)/i, // address
    /^(linkedin|github|portfolio)/i,                    // social links
    /^(http|www\.)/i,                                   // URLs
  ];
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (!line) { skipUntil = i + 1; continue; }
    if (headerPatterns.some(p => p.test(line))) { skipUntil = i + 1; continue; }
    break;
  }
  return skipUntil > 0 ? lines.slice(skipUntil).join("\n").trim() : text;
}

function enforceCharLimits(resume: string, jd: string): { resume: string; jd: string; truncated: boolean } {
  let truncated = false;
  if (resume.length > MAX_RESUME_CHARS) { resume = resume.slice(0, MAX_RESUME_CHARS); truncated = true; }
  if (jd.length > MAX_JD_CHARS) { jd = jd.slice(0, MAX_JD_CHARS); truncated = true; }
  const combined = resume.length + jd.length;
  if (combined > MAX_COMBINED_CHARS) {
    const excess = combined - MAX_COMBINED_CHARS;
    resume = resume.slice(0, resume.length - excess);
    truncated = true;
  }
  return { resume, jd, truncated };
}

function sanitizeInput(input: string): string {
  return input
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/you\s+are\s+now\s+/gi, "")
    .replace(/act\s+as\s+/gi, "")
    .replace(/pretend\s+(you\s+are|to\s+be)\s+/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were", "have", "has", "had", "will", "can", "must", "should", "into", "onto", "through", "across", "over", "under", "about", "within", "between", "using", "use", "used", "their", "they", "them", "job", "role", "position", "candidate", "required", "preferred", "responsibilities", "requirements", "experience", "ability", "skills", "skill", "work", "working", "team", "teams", "customer", "customers", "service", "services", "business",
]);

const OWNERSHIP_STRONG_PHRASES = [
  "led", "drove", "owned", "architected", "directed", "launched", "built", "scaled", "implemented", "executed", "transformed", "governed", "delivered", "established", "redesigned", "devised", "instituted", "restructured", "consolidated", "accelerated", "elevated", "oversaw", "administered", "standardized", "created", "developed", "designed", "automated", "negotiated", "facilitated", "optimized", "revamped", "formulated", "engineered", "deployed", "maintained", "resolved", "streamlined", "trained", "mentored", "supervised",
];

const OWNERSHIP_PARTIAL_PHRASES = [
  "managed", "coordinated", "responsible for", "handled", "worked on", "contributed to", "involved in", "engaged", "tracked", "monitored", "reviewed", "prepared", "processed", "compiled", "organized", "planned", "conducted", "performed", "served",
];

const PASSIVE_PHRASES = [
  "helped", "assisted", "supported", "participated in", "was involved", "tasked with",
];

const STAKEHOLDER_COMPLEXITY_PHRASES = [
  "cross-functional", "cross functional", "stakeholder", "stakeholders", "executive", "leadership team", "vp", "director", "c-suite", "client-facing", "client facing", "vendor", "partnered with", "matrix", "governance", "internal teams", "external", "departments", "leadership", "clients", "partners", "administrators",
];

const OPERATIONAL_SCOPE_PHRASES = [
  "end-to-end", "end to end", "portfolio", "program", "roadmap", "workflow", "process", "operating model", "sla", "kpi", "governance", "capacity", "throughput", "multi-site", "global", "regional", "standardized", "playbook", "high-volume", "high volume", "caseload", "concurrent", "pipeline", "routing", "triage", "escalation", "documentation", "protocols", "intake",
];

const ACCOUNTABILITY_PHRASES = [
  "accountable", "accountability", "ownership", "owned", "p&l", "budget", "decision", "decision-making", "decision making", "authority", "risk", "compliance", "governance", "end-to-end", "end to end", "primary", "responsible", "audit", "traceability", "accuracy", "standards",
];

const OUTCOME_TERMS = [
  "increased", "reduced", "improved", "grew", "saved", "delivered", "achieved", "exceeded", "decreased", "boosted", "lowered", "raised", "generated", "optimized", "reducing", "improving", "streamlined", "standardizing", "minimized", "eliminated", "enhancing",
];

const TOOL_SIGNAL_PHRASES = [
  "crm", "salesforce", "hubspot", "marketo", "jira", "asana", "tableau", "power bi", "excel", "sql", "python", "zendesk", "servicenow", "workday", "sap", "oracle", "adobe", "microsoft office", "microsoft", "slack", "monday", "confluence", "sharepoint", "google sheets", "quickbooks", "netsuite",
];

interface RecalibrationDiagnostics {
  preprocessing: {
    raw_token_count: number;
    normalized_token_count: number;
    sanitized_token_count: number;
    token_retention_ratio: number;
  };
  detection: {
    jd_keyword_count: number;
    jd_phrase_count: number;
    jd_keyword_hits: number;
    jd_phrase_hits: number;
    ownership_strong_hits: number;
    ownership_partial_hits: number;
    passive_hits: number;
    stakeholder_hits: number;
    operational_scope_hits: number;
    accountability_hits: number;
    quantified_outcome_hits: number;
    outcome_language_hits: number;
    tool_hits: number;
  };
  weighting: {
    jd_mirror_quality: number;
    ownership_quality: number;
    stakeholder_quality: number;
    operational_scope_quality: number;
    accountability_quality: number;
    measurable_outcomes_quality: number;
    tool_workflow_quality: number;
    passive_penalty: number;
  };
  breakdown: {
    role_outcomes_alignment: number;
    tools_and_workflow_alignment: number;
    domain_and_context_alignment: number;
    context_and_scale_alignment: number;
    communication_and_leadership_alignment: number;
  };
  aggregation: {
    weighted_sum: number;
    final_score: number;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

/** Naive English stemmer â€” strips common suffixes for fuzzy JD keyword matching */
function stem(word: string): string {
  return word
    .replace(/ies$/, "i")
    .replace(/ied$/, "i")
    .replace(/(ing|tion|ment|ness|ence|ance|ity|ous|ive|ful|less|able|ible|ated|ting|sion)$/, "")
    .replace(/s$/, "")
    .replace(/ed$/, "");
}

function countPhraseHits(text: string, phrases: string[]): number {
  return phrases.reduce((sum, phrase) => {
    const escaped = phrase
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "gi");
    return sum + ((text.match(rx) || []).length);
  }, 0);
}

function toDensityPer100Words(hits: number, tokenCount: number): number {
  const units = Math.max(tokenCount / 100, 1);
  return hits / units;
}

function qualityFromDensity(hits: number, tokenCount: number, targetDensity: number): number {
  const density = toDensityPer100Words(hits, tokenCount);
  return clamp01(density / targetDensity);
}

function buildJdSignalVocabulary(jdText: string): { keywords: string[]; phrases: string[]; stemmedKeywords: string[] } {
  const jdTokens = tokenize(jdText).filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
  const tokenFreq = new Map<string, number>();
  for (const token of jdTokens) {
    tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
  }

  const keywords = [...tokenFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, 15)
    .map(([token]) => token);

  const stemmedKeywords = [...new Set(keywords.map(stem))].filter(s => s.length >= 3);

  const phraseFreq = new Map<string, number>();
  const sentences = jdText.toLowerCase().split(/[\n.;:!?]+/).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const words = tokenize(sentence).filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      phraseFreq.set(bi, (phraseFreq.get(bi) || 0) + 1);
      if (i < words.length - 2) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        phraseFreq.set(tri, (phraseFreq.get(tri) || 0) + 1);
      }
    }
  }

  const phrases = [...phraseFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, 8)
    .map(([phrase]) => phrase);

  return { keywords, phrases, stemmedKeywords };
}

function scoreLabelFromValue(score: number): "Weak" | "Moderate" | "Solid" | "Strong" {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Solid";
  if (score >= 50) return "Moderate";
  return "Weak";
}

function computeRecalibratedScore(input: {
  rawResume: string;
  normalizedResume: string;
  sanitizedResume: string;
  jd: string;
}): RecalibrationDiagnostics {
  const { rawResume, normalizedResume, sanitizedResume, jd } = input;

  const rawTokens = tokenize(rawResume);
  const normalizedTokens = tokenize(normalizedResume);
  const resumeTokens = tokenize(sanitizedResume);
  const resumeTokenSet = new Set(resumeTokens);
  const resumeLower = sanitizedResume.toLowerCase();

  const jdModel = buildJdSignalVocabulary(jd);

  // Exact keyword matches
  const jdKeywordHitsExact = jdModel.keywords.reduce((sum, token) => sum + (resumeTokenSet.has(token) ? 1 : 0), 0);

  // Stemmed keyword matches (fuzzy â€” catches "managing" matching "management", etc.)
  const resumeStemSet = new Set(resumeTokens.map(stem).filter(s => s.length >= 3));
  const jdKeywordHitsStemmed = jdModel.stemmedKeywords.reduce((sum, stemmed) => sum + (resumeStemSet.has(stemmed) ? 1 : 0), 0);

  // Use the better of exact or stemmed coverage, with stemmed getting 0.8 weight
  const exactCoverage = jdKeywordHitsExact / Math.max(jdModel.keywords.length, 1);
  const stemmedCoverage = jdKeywordHitsStemmed / Math.max(jdModel.stemmedKeywords.length, 1);
  const effectiveKeywordCoverage = Math.max(exactCoverage, stemmedCoverage * 0.92);

  const jdPhraseHits = jdModel.phrases.reduce((sum, phrase) => {
    const escaped = phrase
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "i");
    return sum + (rx.test(resumeLower) ? 1 : 0);
  }, 0);

  const ownershipStrongHits = countPhraseHits(resumeLower, OWNERSHIP_STRONG_PHRASES);
  const ownershipPartialHits = countPhraseHits(resumeLower, OWNERSHIP_PARTIAL_PHRASES);
  const passiveHits = countPhraseHits(resumeLower, PASSIVE_PHRASES);
  const stakeholderHits = countPhraseHits(resumeLower, STAKEHOLDER_COMPLEXITY_PHRASES);
  const operationalScopeHits = countPhraseHits(resumeLower, OPERATIONAL_SCOPE_PHRASES);
  const accountabilityHits = countPhraseHits(resumeLower, ACCOUNTABILITY_PHRASES);
  const outcomeLanguageHits = countPhraseHits(resumeLower, OUTCOME_TERMS);
  const toolHits = countPhraseHits(resumeLower, TOOL_SIGNAL_PHRASES);
  const quantifiedOutcomeHits = (resumeLower.match(/(?:\$\s?\d+[\d,.]*\s?[kmb]?|\b\d+(?:\.\d+)?\s?%|\b\d+[xÃ—]|\b\d+\s?(?:customers|clients|teams|projects|accounts|locations|regions|departments|stakeholders|hours|days|weeks|months|years))\b/gi) || []).length;

  const jdPhraseCoverage = jdPhraseHits / Math.max(jdModel.phrases.length, 1);

  // â”€â”€ RECALIBRATED quality computations â”€â”€
  // Density targets lowered to match real resume profiles (~0.3-0.6 per 100 words)
  const jdMirrorQuality = clamp01((effectiveKeywordCoverage * 0.65) + (jdPhraseCoverage * 0.35));

  // Ownership: lower targets, reduced passive penalty, stronger bonus for strong verbs
  const ownershipQuality = clamp01(
    (qualityFromDensity(ownershipStrongHits, resumeTokens.length, 0.25) * 0.55) +
      (qualityFromDensity(ownershipPartialHits, resumeTokens.length, 0.35) * 0.30) +
      (qualityFromDensity(accountabilityHits, resumeTokens.length, 0.30) * 0.15) -
      (qualityFromDensity(passiveHits, resumeTokens.length, 0.60) * 0.10),
  );

  const stakeholderQuality = clamp01(
    (qualityFromDensity(stakeholderHits, resumeTokens.length, 0.30) * 0.60) + (jdMirrorQuality * 0.40),
  );

  const operationalScopeQuality = clamp01(
    (qualityFromDensity(operationalScopeHits, resumeTokens.length, 0.30) * 0.60) +
      (qualityFromDensity(toolHits, resumeTokens.length, 0.20) * 0.40),
  );

  const accountabilityQuality = clamp01(
    (qualityFromDensity(accountabilityHits, resumeTokens.length, 0.30) * 0.65) + (ownershipQuality * 0.35),
  );

  const measurableOutcomesQuality = clamp01(
    (qualityFromDensity(quantifiedOutcomeHits, resumeTokens.length, 0.25) * 0.60) +
      (qualityFromDensity(outcomeLanguageHits, resumeTokens.length, 0.35) * 0.40),
  );

  const toolWorkflowQuality = clamp01(
    (qualityFromDensity(toolHits, resumeTokens.length, 0.20) * 0.45) + (jdMirrorQuality * 0.55),
  );

  const passivePenalty = clamp01(qualityFromDensity(passiveHits, resumeTokens.length, 0.60) * 0.5);

  // â”€â”€ Signal Vocabulary Bonus â”€â”€
  // Rewards calibrated language: high strong-ownership density + low passive density
  const strongOwnershipDensity = toDensityPer100Words(ownershipStrongHits, resumeTokens.length);
  const passiveDensity = toDensityPer100Words(passiveHits, resumeTokens.length);
  const ownershipRatio = ownershipStrongHits / Math.max(ownershipStrongHits + passiveHits, 1);
  // Bonus scales 0-0.18: full bonus when ownership ratio > 0.7 and strong density > 0.4
  const vocabBonus = clamp01(ownershipRatio * 1.3) * clamp01(strongOwnershipDensity / 0.35) * 0.18;

  // â”€â”€ Dimension scores with recalibrated weights â”€â”€
  const roleOutcomesAlignment = Math.floor(100 * clamp01(
    (ownershipQuality * 0.28) +
      (measurableOutcomesQuality * 0.25) +
      (accountabilityQuality * 0.20) +
      (jdMirrorQuality * 0.22) +
      vocabBonus -
      (passivePenalty * 0.06),
  ));

  const toolsAndWorkflowAlignment = Math.floor(100 * clamp01(
    (toolWorkflowQuality * 0.50) + (jdMirrorQuality * 0.50),
  ));

  const domainAndContextAlignment = Math.floor(100 * clamp01(
    (jdMirrorQuality * 0.65) + (operationalScopeQuality * 0.35),
  ));

  const contextAndScaleAlignment = Math.floor(100 * clamp01(
    (operationalScopeQuality * 0.38) +
      (measurableOutcomesQuality * 0.30) +
      (accountabilityQuality * 0.18) +
      (jdMirrorQuality * 0.14),
  ));

  const communicationAndLeadershipAlignment = Math.floor(100 * clamp01(
    (stakeholderQuality * 0.28) +
      (ownershipQuality * 0.25) +
      (accountabilityQuality * 0.20) +
      (jdMirrorQuality * 0.22) +
      vocabBonus -
      (passivePenalty * 0.08),
  ));

  const weightedSum =
    (roleOutcomesAlignment * 0.30) +
    (toolsAndWorkflowAlignment * 0.20) +
    (domainAndContextAlignment * 0.20) +
    (contextAndScaleAlignment * 0.15) +
    (communicationAndLeadershipAlignment * 0.15);

  const finalScore = Math.floor(weightedSum);

  return {
    preprocessing: {
      raw_token_count: rawTokens.length,
      normalized_token_count: normalizedTokens.length,
      sanitized_token_count: resumeTokens.length,
      token_retention_ratio: roundTo(resumeTokens.length / Math.max(rawTokens.length, 1)),
    },
    detection: {
      jd_keyword_count: jdModel.keywords.length,
      jd_phrase_count: jdModel.phrases.length,
      jd_keyword_hits: jdKeywordHitsExact,
      jd_keyword_hits_stemmed: jdKeywordHitsStemmed,
      jd_phrase_hits: jdPhraseHits,
      effective_keyword_coverage: roundTo(effectiveKeywordCoverage),
      ownership_strong_hits: ownershipStrongHits,
      ownership_partial_hits: ownershipPartialHits,
      passive_hits: passiveHits,
      stakeholder_hits: stakeholderHits,
      operational_scope_hits: operationalScopeHits,
      accountability_hits: accountabilityHits,
      quantified_outcome_hits: quantifiedOutcomeHits,
      outcome_language_hits: outcomeLanguageHits,
      tool_hits: toolHits,
    },
    weighting: {
      jd_mirror_quality: roundTo(jdMirrorQuality),
      ownership_quality: roundTo(ownershipQuality),
      stakeholder_quality: roundTo(stakeholderQuality),
      operational_scope_quality: roundTo(operationalScopeQuality),
      accountability_quality: roundTo(accountabilityQuality),
      measurable_outcomes_quality: roundTo(measurableOutcomesQuality),
      tool_workflow_quality: roundTo(toolWorkflowQuality),
      passive_penalty: roundTo(passivePenalty),
      vocab_bonus: roundTo(vocabBonus),
      ownership_ratio: roundTo(ownershipRatio),
    },
    breakdown: {
      role_outcomes_alignment: roleOutcomesAlignment,
      tools_and_workflow_alignment: toolsAndWorkflowAlignment,
      domain_and_context_alignment: domainAndContextAlignment,
      context_and_scale_alignment: contextAndScaleAlignment,
      communication_and_leadership_alignment: communicationAndLeadershipAlignment,
    },
    aggregation: {
      weighted_sum: roundTo(weightedSum, 2),
      final_score: finalScore,
    },
  };
}

// â”€â”€â”€ In-memory result cache (SHA-256, 30min TTL, 50 entries) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const resultCache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 50;

async function hashInputs(a: string, b: string, mode: string): Promise<string> {
  const enc = new TextEncoder().encode(a + "|" + b + "|" + mode);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { resultCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>) {
  if (resultCache.size >= CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(key, { data, ts: Date.now() });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const requestStartedAt = Date.now();

  try {
    const body = await req.json();
    const {
      bullet,
      jd,
      userId,
      mode = "single_bullet",
      sessionToken,
      runType = "original",
      evidencePackage,
      calibrationContext,
    } = body;

    // --- Input validation (always 200) ---
    if (!bullet || typeof bullet !== "string" || !jd || typeof jd !== "string") {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INVALID_INPUT", message: "Missing or invalid resume or job description fields." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedBullet = bullet.trim();
    const trimmedJd = jd.trim();

    if (trimmedBullet.length < 20) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Experience input must be at least 20 characters." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (trimmedJd.length < 20) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Job description must be at least 20 characters." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Normalize and enforce limits ---
    let normalizedBullet = normalizeText(stripResumeHeader(trimmedBullet));
    let normalizedJd = normalizeText(trimmedJd);
    const limits = enforceCharLimits(normalizedBullet, normalizedJd);
    normalizedBullet = limits.resume;
    normalizedJd = limits.jd;

    const cleanBullet = sanitizeInput(normalizedBullet);
    const cleanJd = sanitizeInput(normalizedJd);

    if (cleanBullet.length < MIN_RESUME_CHARS) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Please paste more of your Experience section so Signalyz can analyze your signal.", details: { resume_len: cleanBullet.length, jd_len: cleanJd.length } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (cleanJd.length < MIN_JD_CHARS) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Please paste the job description responsibilities and requirements so Signalyz can calibrate your signal.", details: { resume_len: cleanBullet.length, jd_len: cleanJd.length } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const verifiedUserId = await getUserIdFromRequest(req);
    const entitlements = verifiedUserId
      ? await loadUserEntitlements(sb, verifiedUserId)
      : guestEntitlements();
    const isProAlignment = entitlements.isProEntitled;
    const userPlan = isProAlignment ? "pro" : "free";

    let reportRunAccess = false;
    if (verifiedUserId && mode === "multi_bullet") {
      const runAccess = await resolveReportRunAccess(
        sb,
        verifiedUserId,
        entitlements,
        extractCanonicalRunContext(body as Record<string, unknown>),
        { requireCanonical: shouldConsumeOneTimeCredit(entitlements) },
      );
      if (!runAccess.ok) {
        return reportRunAccessJsonResponse(runAccess, corsHeaders, requestId);
      }
      reportRunAccess = runAccess.reportRunAccess;
    }

    const modeGate = evaluateOptimizeBulletAccess({
      verifiedUserId,
      mode,
      entitlements,
      reportRunAccess,
    });
    if (modeGate) {
      return entitlementJsonResponse(modeGate, corsHeaders, requestId);
    }

    const today = new Date().toISOString().slice(0, 10);
    const usageIdentity = buildAlignmentUsageIdentity(
      verifiedUserId,
      sessionToken,
      isValidSessionToken,
    );

    if (!isProAlignment) {
      const guestGate = evaluateGuestAlignmentSession(verifiedUserId, sessionToken, isValidSessionToken);
      if (guestGate) {
        return entitlementJsonResponse(guestGate, corsHeaders, requestId);
      }
      const usage = await getAlignmentUsageCount(sb, usageIdentity, today);
      if (usage.alignmentCount >= DAILY_FREE_ALIGNMENT_LIMIT) {
        return new Response(JSON.stringify({
          status: "error",
          request_id: requestId,
          error_code: "RATE_LIMIT",
          message: `Daily free limit reached (${DAILY_FREE_ALIGNMENT_LIMIT} alignments per day). Upgrade to Signalyz Pro for unlimited alignments.`,
          limit_reached: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const normalizedEvidence = normalizeEvidencePackage(
      Array.isArray(evidencePackage) ? (evidencePackage as EvidencePackageItem[]) : [],
    );
    const originalBulletForGrounding =
      typeof calibrationContext?.originalBullet === "string"
        ? calibrationContext.originalBullet.trim()
        : "";
    const missingSignalForGrounding =
      typeof calibrationContext?.missingSignal === "string"
        ? calibrationContext.missingSignal.trim() || null
        : null;
    const groundingEnabled = originalBulletForGrounding.length > 0 || normalizedEvidence.length > 0;

    console.log(JSON.stringify({
      event: "request_start",
      request_id: requestId,
      function: "optimize-bullet",
      timestamp: new Date().toISOString(),
      resume_text_length: typeof bullet === "string" ? bullet.length : 0,
      jd_text_length: typeof jd === "string" ? jd.length : 0,
      total_payload_length: (typeof bullet === "string" ? bullet.length : 0) + (typeof jd === "string" ? jd.length : 0),
      user_plan: userPlan,
      client_mode: mode,
      entitlement_source: entitlements.entitlementSource,
      is_pro_entitled: isProAlignment,
      evidence_count: normalizedEvidence.length,
      grounding_enabled: groundingEnabled,
    }));

    // --- Cache check (Pro only — free tier must not bypass usage limits) ---
    const evidenceCachePart = normalizedEvidence.length > 0
      ? normalizedEvidence.map((item) => item.evidence_id).join(",")
      : originalBulletForGrounding.slice(0, 64);
    const cacheKey = await hashInputs(cleanBullet, cleanJd, `${userPlan}:${runType}:${evidenceCachePart}`);
    if (isProAlignment) {
      const cached = getCached(cacheKey);
      if (cached) {
        console.log("Cache HIT for", cacheKey.slice(0, 12));
        return new Response(JSON.stringify({ status: "success", request_id: requestId, cached: true, ...cached }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const maxTokens = isProAlignment ? PRO_TIER_MAX_TOKENS : FREE_TIER_MAX_TOKENS;
    let prompt = buildSlimAlignmentPrompt(cleanBullet, cleanJd, isProAlignment);
    if (groundingEnabled) {
      prompt += `\n\n${buildEvidencePromptBlock({
        evidence: normalizedEvidence,
        originalBullet: originalBulletForGrounding,
        jd: cleanJd,
        missingSignal: missingSignalForGrounding,
      })}`;
    }

    const aiResult = await callAI(apiKey, prompt, maxTokens);
    const { content } = aiResult;
    let titan: Record<string, unknown>;
    try {
      titan = extractJSON(content);
      console.log(JSON.stringify({
        event: "alignment_observability",
        request_id: requestId,
        user_plan: userPlan,
        content_length: content.length,
        stop_reason: aiResult.stop_reason,
        output_tokens: aiResult.output_tokens,
        input_tokens: aiResult.input_tokens,
        parse_success: true,
        total_duration_ms: Date.now() - requestStartedAt,
        anthropic_calls: 1,
        evidence_count: normalizedEvidence.length,
        grounding_enabled: groundingEnabled,
        timestamp: new Date().toISOString(),
      }));
    } catch {
      console.error(JSON.stringify({
        event: "alignment_observability",
        request_id: requestId,
        user_plan: userPlan,
        content_length: content.length,
        stop_reason: aiResult.stop_reason,
        output_tokens: aiResult.output_tokens,
        input_tokens: aiResult.input_tokens,
        parse_success: false,
        total_duration_ms: Date.now() - requestStartedAt,
        anthropic_calls: 1,
        evidence_count: normalizedEvidence.length,
        grounding_enabled: groundingEnabled,
        content_preview: content.slice(0, 300),
        content_tail: content.slice(-800),
        timestamp: new Date().toISOString(),
      }));
      throw new Error("Signal calibration response could not be processed. Please try again.");
    }

    const recalibrationDiagnostics = computeRecalibratedScore({
      rawResume: trimmedBullet,
      normalizedResume: normalizedBullet,
      sanitizedResume: cleanBullet,
      jd: cleanJd,
    });

    const deterministicMatchScore = recalibrationDiagnostics.aggregation.final_score;
    const deterministicLabel = scoreLabelFromValue(deterministicMatchScore);
    const aiScoreBeforeOverride = Number((titan.match_score as any)?.score ?? 0);

    const existingMatchScore = (typeof titan.match_score === "object" && titan.match_score !== null)
      ? (titan.match_score as Record<string, unknown>)
      : {};
    titan.match_score = {
      ...existingMatchScore,
      score: deterministicMatchScore,
      label: deterministicLabel,
    };


    const existingDebug = (typeof titan.debug === "object" && titan.debug !== null)
      ? (titan.debug as Record<string, unknown>)
      : {};
    titan.debug = {
      ...existingDebug,
      scoring_breakdown: recalibrationDiagnostics.breakdown,
      recalibration_diagnostics: {
        ...recalibrationDiagnostics,
        ai_score_before_override: aiScoreBeforeOverride,
        score_delta_from_ai: deterministicMatchScore - aiScoreBeforeOverride,
      },
    };

    if (typeof titan.interview_gap_diagnosis === "object" && titan.interview_gap_diagnosis !== null) {
      (titan.interview_gap_diagnosis as Record<string, unknown>).current_score = deterministicMatchScore;
    }
    if (typeof titan.predicted_signal_lift === "object" && titan.predicted_signal_lift !== null) {
      (titan.predicted_signal_lift as Record<string, unknown>).current_score = deterministicMatchScore;
    }

    const optimizedBulletsRaw = Array.isArray(titan.optimized_bullets)
      ? (titan.optimized_bullets as Array<{ text?: string; variant?: string }>)
      : [];

    const calibratedBullets = groundingEnabled
      ? buildCalibratedBulletRecords({
        optimizedBullets: optimizedBulletsRaw,
        originalBullet: originalBulletForGrounding,
        evidence: normalizedEvidence,
        jd: cleanJd,
      })
      : [];

    const groundingContext = {
      evidence_count: normalizedEvidence.length,
      original_bullet: originalBulletForGrounding || null,
      missing_signal: missingSignalForGrounding,
    };

    // Map slim contract to the shape the frontend expects
    let optimizedBullet = optimizedBulletsRaw[0]?.text || "";
    let altA = optimizedBulletsRaw[1]?.text || optimizedBullet;
    let altB = optimizedBulletsRaw[2]?.text || optimizedBullet;

    if (calibratedBullets.length > 0) {
      optimizedBullet = calibratedBullets[0]?.text || optimizedBullet;
      altA = calibratedBullets[1]?.text || altA;
      altB = calibratedBullets[2]?.text || altB;
    }

    const matchScore = titan.match_score?.score ?? 0;
    const confidenceLevel = titan.match_score?.label || "";
    const missingKeywords = titan.missing_keywords || [];
    const suggestedVerbs = titan.suggested_action_verbs || [];
    const alignmentNotes = titan.alignment_intelligence_summary || "";
    const gapSuggestions = titan.strategic_gap_actions?.length
      ? titan.strategic_gap_actions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")
      : null;

    const priorities = titan.debug?.extracted_jd_priorities || [];
    const topMatchedSignal = priorities.length > 0 ? priorities[0].priority : null;
    const topMissingSignal = missingKeywords.length > 0 ? missingKeywords[0] : null;

    const breakdown = titan.debug?.scoring_breakdown || {};
    const scoreRationale = titan.match_score?.score_rationale || [];
    const parsedRationale = splitScoreRationale(
      Array.isArray(scoreRationale) ? (scoreRationale as string[]) : [],
    );

    const weightedPriorityCommentary = titan.weighted_priority_commentary || null;
    const strategicBridgeAnalysis = titan.strategic_bridge_analysis || null;

    // Build unified SignalModel
    const signalModel = {
      role: {
        title: (titan.inferred_role_title as string) || "",
        level_inferred: confidenceLevel,
        confidence: confidenceLevel || "Weak",
      },
      weights: {
        operational: priorities.find((p: any) => /operat/i.test(p.priority))?.weight || 0.15,
        stakeholder: priorities.find((p: any) => /stakeholder|relationship|partner/i.test(p.priority))?.weight || 0.15,
        strategic: priorities.find((p: any) => /strateg/i.test(p.priority))?.weight || 0.20,
        performance: priorities.find((p: any) => /perform|impact|outcome/i.test(p.priority))?.weight || 0.25,
        domain: priorities.find((p: any) => /domain|industry|sector/i.test(p.priority))?.weight || 0.25,
      },
      strengths: parsedRationale.strengths.length > 0
        ? parsedRationale.strengths
        : [],
      gaps: parsedRationale.gaps.length > 0
        ? parsedRationale.gaps
        : [],
      under_signaled_keywords: missingKeywords as string[],
      evidence_ledger: [
        ...(titan.resume_signal_profile
          ? Object.entries(titan.resume_signal_profile as Record<string, any>)
              .flatMap(([k, v]) => (v?.evidence || []).map((e: string) => ({ claim: k.replace(/_/g, " "), source: "resume" as const, evidence: e })))
          : []),
        ...priorities.map((p: any) => ({ claim: p.priority, source: "jd" as const, evidence: p.evidence || "" })),
      ],
      risk_projection: {
        stages: titan.hiring_pipeline_simulation || [],
      },
      recommended_rewrites: {
        bullets: titan.optimized_bullets || [],
      },
      resume_signal_profile: titan.resume_signal_profile || null,
      jd_signal_extraction: titan.jd_signal_extraction || null,
      signal_alignment_analysis: titan.signal_alignment_analysis || [],
      executive_insight_summary: titan.executive_insight_summary || null,
      transferable_signal_detection: titan.transferable_signal_detection || null,
      signal_map: titan.signal_map || null,
      signal_shift_estimates: (() => {
        const sse = titan.signal_shift_estimates as any;
        if (!sse) return null;
        // Hard cap all "after" values at 95 (percentage scale)
        const capped: Record<string, any> = {};
        for (const [key, val] of Object.entries(sse)) {
          const v = val as any;
          if (v && typeof v.before === 'number' && typeof v.after === 'number') {
            capped[key] = { before: v.before, after: Math.min(v.after, 95) };
          } else {
            capped[key] = v;
          }
        }
        return capped;
      })(),
      identity_strength_index: titan.identity_strength_index || null,
      career_signal_map: (() => {
        const csm = titan.career_signal_map as any;
        if (!csm) return null;
        // Deterministic tiebreaker: sort by score desc, then matched_jd_dimensions desc, then role name asc
        const sortEntries = (arr: any[]) => {
          if (!Array.isArray(arr)) return arr;
          return [...arr].sort((a, b) => {
            const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
            if (Math.abs(scoreDiff) > 5) return scoreDiff;
            const dimDiff = (b.matched_jd_dimensions ?? 0) - (a.matched_jd_dimensions ?? 0);
            if (dimDiff !== 0) return dimDiff;
            return (a.role ?? "").localeCompare(b.role ?? "");
          });
        };
        // Merge all roles, sort deterministically, then cap at 1 primary + 1 secondary
        const allRoles = [
          ...(csm.primary_alignment || []),
          ...(csm.secondary_alignment || []),
        ];
        const sorted = sortEntries(allRoles);
        return {
          primary_alignment: sorted.slice(0, 1),
          secondary_alignment: sorted.slice(1, 2),
        };
      })(),
      hiring_signal_benchmark: titan.hiring_signal_benchmark || null,
      interview_gap_diagnosis: (() => {
        if (parsedRationale.gaps.length === 0) return null;
        const gapActions = Array.isArray(titan.strategic_gap_actions)
          ? (titan.strategic_gap_actions as string[]).slice(0, 3)
          : [];
        return {
          primary_blocker: parsedRationale.gaps[0],
          what_hiring_managers_see: [],
          strategic_fixes: gapActions,
          current_score: matchScore,
          predicted_score: matchScore,
        };
      })(),
      predicted_signal_lift: (() => {
        const psl = titan.predicted_signal_lift as any;
        if (!psl) return null;
        const currentScore = psl.current_score ?? (titan.match_score as any)?.score ?? 0;
        const dims = Array.isArray(psl.dimensions) ? psl.dimensions : [];
        const totalLift = dims.reduce((sum: number, d: any) => sum + (d.lift ?? 0), 0);
        const captured = Math.round(totalLift * 0.50);
        const predictedScore = Math.min(currentScore + captured, currentScore + 15);
        console.log(`[predicted_score] lifts=${dims.map((d:any)=>d.lift).join('+')}, total=${totalLift}, captured=${captured}, current=${currentScore}, predicted=${predictedScore}`);
        return { ...psl, current_score: currentScore, predicted_score: predictedScore };
      })(),
      match_score: titan.match_score || { score: matchScore, label: confidenceLevel, score_rationale: [] },
      scoring_breakdown: breakdown,
    };

    const result = {
      optimized_bullet: optimizedBullet,
      match_score: matchScore,
      alignment_confidence_level: confidenceLevel,
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
      alignment_notes: alignmentNotes,
      gap_suggestions: gapSuggestions,
      top_matched_signal: topMatchedSignal,
      top_missing_signal: topMissingSignal,
      score_rationale: scoreRationale,
      scoring_breakdown: breakdown,
      extracted_jd_priorities: priorities,
      used_signals: titan.optimized_bullets?.[0]?.used_signals || [],
      removed_or_softened: titan.optimized_bullets?.[0]?.removed_or_softened || [],
      weighted_priority_commentary: weightedPriorityCommentary,
      strategic_bridge_analysis: strategicBridgeAnalysis,
      identity_strength_index: titan.identity_strength_index || null,
      inferred_role_title: (titan.inferred_role_title as string) || null,
      // Signal diagnostic modules (legacy direct access)
      jd_signal_extraction: titan.jd_signal_extraction || null,
      resume_signal_profile: titan.resume_signal_profile || null,
      signal_alignment_analysis: titan.signal_alignment_analysis || null,
      hiring_pipeline_simulation: titan.hiring_pipeline_simulation || null,
      executive_insight_summary: titan.executive_insight_summary || null,
      transferable_signal_detection: titan.transferable_signal_detection || null,
      signal_shift_estimates: titan.signal_shift_estimates || null,
      signal_map: titan.signal_map || null,
      career_signal_map: signalModel.career_signal_map || null,
      hiring_signal_benchmark: titan.hiring_signal_benchmark || null,
      interview_gap_diagnosis: signalModel.interview_gap_diagnosis || null,
      predicted_signal_lift: signalModel.predicted_signal_lift || null,
      // Unified SignalModel
      signal_model: signalModel,
      // Diagnostics passthrough for client-side trace logging
      debug: titan.debug || null,
      grounding_context: groundingContext,
      calibrated_bullets: calibratedBullets.length > 0 ? calibratedBullets : null,
    };

    // Save to database
    await sb.from("optimizations").insert({
      user_id: verifiedUserId || null,
      input_bullet: cleanBullet,
      input_jd: cleanJd,
      optimized_bullet: optimizedBullet,
      match_score: Math.round(matchScore),
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
    }).throwOnError();

    if (!isProAlignment) {
      await incrementAlignmentUsage(sb, usageIdentity, today);
    }

    // Cache the result for repeat analyses (Pro only)
    if (isProAlignment) {
      setCache(cacheKey, result);
    }

    return new Response(JSON.stringify({ status: "success", request_id: requestId, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack || "" : "";
    console.error(JSON.stringify({
      event: "request_error",
      request_id: requestId,
      function: "optimize-bullet",
      error_message: message,
      timestamp: new Date().toISOString(),
    }));
    const friendly =
      message.includes("Rate limits") ? "Too many requests. Please wait a moment and try again." :
      message.includes("Daily free limit") ? message :
      message.includes("aborted") ? "Analysis took too long. Please retry." :
      "Something went wrong. Please try again.";
    return new Response(JSON.stringify({
      status: "error",
      request_id: requestId,
      error_code: message.includes("Daily free limit") ? "RATE_LIMIT" : "ENGINE_ERROR",
      message: friendly,
      limit_reached: message.includes("Daily free limit"),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
