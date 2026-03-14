import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_FREE_LIMIT = 3;

// ─── Input limits ────────────────────────────────────────────────────────────
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

async function callAI(apiKey: string, prompt: string, maxTokens = 3500, extraSystemNote?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 120s for cold starts
  try {
    const systemContent = extraSystemNote
      ? `${DETERMINISTIC_SYSTEM}\n\n${extraSystemNote}`
      : DETERMINISTIC_SYSTEM;
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        temperature: 0,
        system: systemContent,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timeout);
    console.log("Anthropic status:", aiRes.status);
    if (aiRes.ok) {
      const data = await aiRes.json();
      const content = data.content?.[0]?.text || "";
      if (content) return content;
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

// ─── Input normalization ─────────────────────────────────────────────────────

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
  "led", "drove", "owned", "spearheaded", "architected", "orchestrated", "directed", "launched", "built", "scaled", "implemented", "executed", "transformed", "championed", "governed", "delivered", "established", "redesigned", "pioneered", "devised", "instituted", "restructured", "consolidated", "mobilized", "accelerated", "elevated", "oversaw", "administered", "standardized", "created", "developed", "designed", "automated", "negotiated", "facilitated", "optimized", "revamped", "formulated", "engineered", "deployed", "maintained", "resolved", "streamlined", "trained", "mentored", "supervised",
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

/** Naive English stemmer — strips common suffixes for fuzzy JD keyword matching */
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

  // Stemmed keyword matches (fuzzy — catches "managing" matching "management", etc.)
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
  const quantifiedOutcomeHits = (resumeLower.match(/(?:\$\s?\d+[\d,.]*\s?[kmb]?|\b\d+(?:\.\d+)?\s?%|\b\d+[x×]|\b\d+\s?(?:customers|clients|teams|projects|accounts|locations|regions|departments|stakeholders|hours|days|weeks|months|years))\b/gi) || []).length;

  const jdPhraseCoverage = jdPhraseHits / Math.max(jdModel.phrases.length, 1);

  // ── RECALIBRATED quality computations ──
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

  // ── Signal Vocabulary Bonus ──
  // Rewards calibrated language: high strong-ownership density + low passive density
  const strongOwnershipDensity = toDensityPer100Words(ownershipStrongHits, resumeTokens.length);
  const passiveDensity = toDensityPer100Words(passiveHits, resumeTokens.length);
  const ownershipRatio = ownershipStrongHits / Math.max(ownershipStrongHits + passiveHits, 1);
  // Bonus scales 0-0.18: full bonus when ownership ratio > 0.7 and strong density > 0.4
  const vocabBonus = clamp01(ownershipRatio * 1.3) * clamp01(strongOwnershipDensity / 0.35) * 0.18;

  // ── Dimension scores with recalibrated weights ──
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

// ─── In-memory result cache (SHA-256, 30min TTL, 50 entries) ──────────────────
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

  try {
    const { bullet, jd, userId, mode = "single_bullet", sessionToken } = await req.json();
    const userPlan = mode === "multi_bullet" ? "pro" : "free";

    // --- Structured logging ---
    console.log(JSON.stringify({
      event: "request_start",
      request_id: requestId,
      function: "optimize-bullet",
      timestamp: new Date().toISOString(),
      resume_text_length: typeof bullet === "string" ? bullet.length : 0,
      jd_text_length: typeof jd === "string" ? jd.length : 0,
      total_payload_length: (typeof bullet === "string" ? bullet.length : 0) + (typeof jd === "string" ? jd.length : 0),
      user_plan: userPlan,
    }));

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

    // ─── Cache check ───────────────────────────────────────────────────────
    const cacheKey = await hashInputs(cleanBullet, cleanJd, userPlan);
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("Cache HIT for", cacheKey.slice(0, 12));
      return new Response(JSON.stringify({ status: "success", request_id: requestId, cached: true, ...cached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // --- Server-side rate limiting for free users ---
    if (userPlan === "free") {
      const today = new Date().toISOString().slice(0, 10);
      let existing: { id: string; alignment_count: number } | null = null;

      if (userId) {
        const { data } = await sb
          .from("usage_tracking")
          .select("id, alignment_count")
          .eq("user_id", userId)
          .eq("usage_date", today)
          .maybeSingle();
        existing = data;
      } else if (sessionToken) {
        const { data } = await sb
          .from("usage_tracking")
          .select("id, alignment_count")
          .eq("session_token", sessionToken)
          .eq("usage_date", today)
          .maybeSingle();
        existing = data;
      }

      if (existing && existing.alignment_count >= DAILY_FREE_LIMIT) {
        return new Response(JSON.stringify({
          status: "error",
          request_id: requestId,
          error_code: "RATE_LIMIT",
          message: `Daily free limit reached (${DAILY_FREE_LIMIT} alignments per day). Upgrade to Signalyz Pro for unlimited alignments.`,
          limit_reached: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Increment or insert usage
      if (existing) {
        await sb
          .from("usage_tracking")
          .update({ alignment_count: existing.alignment_count + 1, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await sb
          .from("usage_tracking")
          .insert({
            user_id: userId || null,
            session_token: sessionToken || null,
            ip_address: null,
            usage_date: today,
            alignment_count: 1,
          });
      }
    }

    const prompt = `You are Alignment Engine V2. Analyze resume vs JD. No fabrication. Address user as "you/your" only — never third person.

RULES: Never invent tools/metrics/certs. Only reframe existing experience. Return ONLY valid JSON.

DETERMINISTIC EXTRACTION (CRITICAL — follow exactly):
Step 1: JD SIGNAL EXTRACTION — Scan the job description from top to bottom. Extract priority signals in the order they appear. For each signal, count how many times it is referenced (frequency) and where it appears (title, first paragraph = high emphasis; later paragraphs = lower). Rank by frequency × emphasis. This extraction must be identical every time for the same JD text.

Step 2: RESUME SIGNAL EXTRACTION — Scan the resume from top to bottom. For each JD priority signal, classify the match into one of three quality tiers:
  - FULL MATCH (weight 1.0): The resume uses the JD's exact terminology, role-native vocabulary, ownership verbs ("led", "drove", "owned", "architected", "spearheaded"), or quantified impact statements that directly mirror JD language. Example: JD says "stakeholder management" and resume says "stakeholder engagement across cross-functional teams" = FULL MATCH.
  - PARTIAL MATCH (weight 0.5): The resume describes the same capability but uses generic, passive, or non-role-aligned language. Example: JD says "stakeholder management" and resume says "worked with different teams" = PARTIAL MATCH. Also applies when the resume uses "helped", "assisted", "supported", "participated in" instead of ownership language.
  - NO MATCH (weight 0.0): The signal is absent from the resume entirely.
This quality classification is CRITICAL. A calibrated resume that repositions "helped coordinate meetings" into "drove cross-functional alignment across 4 departments" upgrades that signal from PARTIAL to FULL — the same underlying experience produces a higher-quality match because the language maps more clearly to the JD's priority signals. This extraction must be identical every time for the same resume text.

SIGNAL VOCABULARY SENSITIVITY (CRITICAL):
Two resumes describing identical experience but using different vocabulary MUST produce different scores. This is the core scoring mechanism:
- Ownership verbs ("led", "drove", "owned", "built", "launched") score as FULL MATCH; passive verbs ("helped", "assisted", "supported", "was involved in") score as PARTIAL MATCH (0.5).
- JD-mirrored terminology scores as FULL MATCH; generic descriptions of the same work score as PARTIAL MATCH (0.5).
- Quantified impact ("reduced cycle time by 30%", "managed $2M budget") scores as FULL MATCH; unquantified ("improved efficiency", "managed budget") scores as PARTIAL MATCH (0.5).
- Role-aligned framing ("P&L ownership", "go-to-market strategy") scores as FULL MATCH; general framing ("responsible for finances", "helped with launches") scores as PARTIAL MATCH (0.5).
This means a repositioned/calibrated resume with stronger vocabulary WILL score meaningfully higher than the original version — not because the experience changed, but because the signal clarity improved.

Step 3: SCORING — Using the quality-classified signals from Steps 1 and 2, compute match_score as a QUALITY-WEIGHTED sum. For each dimension, sum the quality weights of all matched signals (FULL=1.0, PARTIAL=0.5, ABSENT=0), then divide by total possible signals in that dimension to get a dimension percentage. Apply dimension weights (Role Outcomes 30%, Tools 20%, Domain 20%, Context 15%, Communication 15%), sum to get final score 0-100. This is a mechanical computation from the quality-classified extraction — not an impression. The quality weighting is what makes repositioned language score higher than generic language for the same underlying experience.

SCORING (5 dimensions, weights in parens):
1) Role Outcomes (30%) 2) Tools & Workflow (20%) 3) Domain (20%) 4) Context & Scale (15%) 5) Communication & Leadership (15%)
Labels: 0-49=Weak, 50-64=Moderate, 65-79=Solid, 80+=Strong. No inflation. 80+ requires top-2 JD priority match + tool match + ownership signals.

BULLETS: Max 35 words, high-signal verbs, ATS-safe, no semicolons/em-dashes.
${userPlan === "pro" ? "3 variants: [0]Impact-Focused [1]Human-Natural [2]Keyword-Maximized" : "1 variant: primary (ATS-weighted to top JD priorities)"}

PRIORITIES: Extract 5-8 from JD with weights (0.05-0.25, sum=1.00). List in consistent priority order based on frequency and emphasis. Same JD must always produce the same priorities in the same order.

JSON SCHEMA:
{
  "inferred_role_title": "string",
  "optimized_bullets": [{"text":"string","variant":"string","used_signals":["string"],"removed_or_softened":["string"]}],
  "match_score": {"score":number,"label":"Weak|Moderate|Solid|Strong","score_rationale":["string — each item MUST be prefixed with either '[STRENGTH]' or '[GAP]' to indicate whether it describes a present positive signal or an absent/weak signal"]},
  "missing_keywords": ["string (3-10)"],
  "suggested_action_verbs": ["string (max 5)"],
  "alignment_intelligence_summary": "string (${userPlan === "pro" ? "4-6" : "2-3"} sentences)",
  "strategic_gap_actions": ["string (${userPlan === "pro" ? "up to 5" : "2-3"})"],
  "weighted_priority_commentary": ${userPlan === "pro" ? '"string (3-5 sentences)"' : 'null'},
  "strategic_bridge_analysis": ${userPlan === "pro" ? '{"why_it_translates":"string","perception_gaps":["string"],"interview_narrative":"string"}' : 'null'},
  "identity_strength_index": {
    "total_score": number,
    "pillars": [{"name":"Role Signal Clarity|Commercial Framing Power|Risk Compression Strength|Narrative Cohesion","score":number,"explanation":"string","improvement_lever":"string"}]
  },
  "jd_signal_extraction": {
    "role_identity_signals":["string"],"strategic_signals":["string"],"relationship_signals":["string"],
    "operational_signals":["string"],"leadership_signals":["string"],"priority_summary":"string"
  },
  "resume_signal_profile": {
    "operational_execution":{"strength":"Strong|Moderate|Weak|Missing","evidence":["string"]},
    "stakeholder_coordination":{"strength":"string","evidence":["string"]},
    "strategic_influence":{"strength":"string","evidence":["string"]},
    "performance_improvement":{"strength":"string","evidence":["string"]},
    "domain_expertise":{"strength":"string","evidence":["string"]}
  },
  "signal_alignment_analysis": [{"category":"string","alignment_level":"Strong|Moderate|Weak|Missing","current_signal":"string","perception_gap":"string","threshold_expectation":"string"}],
  "hiring_pipeline_simulation": [
    {"stage":"Recruiter Filter","status":"PASS|MODERATE RISK|HIGH RISK","criteria":["string"],"explanation":"string"},
    {"stage":"Hiring Manager Review","status":"string","criteria":["string"],"explanation":"string"},
    {"stage":"Panel Interview Signal","status":"string","criteria":["string"],"explanation":"string"}
  ],
  "executive_insight_summary": {"primary_insight":"string","primary_strength":"string","why_it_matters":"string","strategic_repositioning_opportunity":"string"},
  "transferable_signal_detection": {"detected_capability":"string","why_it_transfers":"string","elevation_opportunity":"string"},
  "signal_map": {"role_identity":number,"ownership_framing":number,"commercial_impact":number,"domain_expertise":number,"stakeholder_influence":number,"operational_execution":number} (DETERMINISTIC — CRITICAL: Each dimension is scored 0-25 by counting keyword evidence matches. Given identical inputs, return identical scores every time. Do not vary. Use the counting rubric: 0 matches=0, 1-2=5-10, 3-4=10-15, 5+=15-20, 7+=20-25. Round down when between two values.),
  "signal_shift_estimates": {"ownership_signal":{"before":number,"after":number},"commercial_impact_signal":{"before":number,"after":number},"role_identity_clarity":{"before":number,"after":number},"domain_alignment":{"before":number,"after":number}} (IMPORTANT: These values are on a 0-100 PERCENTAGE scale — INDEPENDENT from signal_map's /25 scale. "before" = current signal strength percentage for this dimension based on resume evidence analysis. "after" = projected signal strength percentage after repositioning. These are NOT derived from signal_map scores — they are an independent percentage assessment. DETERMINISTIC PER-DIMENSION DELTAS: Language-addressable gaps receive +15 to +28 percentage points improvement. Structural gaps that cannot be fixed through language alone receive +5 to +12 percentage points improvement. Each delta must be calculated independently. HARD CAP: No "after" value can exceed 95 — there will always be remaining gap.),
  "career_signal_map": {
    "primary_alignment":[{"role":"string","score":number,"signals":["string"],"explanation":"string","matched_jd_dimensions":number}],
    "secondary_alignment":[{"role":"string","score":number,"signals":["string"],"explanation":"string","matched_jd_dimensions":number}]
  },
  "hiring_signal_benchmark": {"user_score":number,"median_candidate_score":number,"top_candidate_threshold":number,"dimension_comparison":[{"dimension":"string","user_score":number,"median_score":number,"gap_explanation":"string"}]} (DETERMINISTIC BENCHMARKS: The median_candidate_score and top_candidate_threshold represent the typical applicant pool for this role type and must be consistent across runs. For a given role type, always return the same median and top threshold values. These are population-level constants, not user-specific. Do not vary these values between runs.),
  "interview_gap_diagnosis": {"primary_issue":"string","what_hiring_managers_see":["string"],"what_this_creates":"string","strategic_fixes":["string — EXACTLY 3 items, no more, no less, ranked by impact on match score"],"current_score":number,"predicted_score":number} (DETERMINISTIC PRIMARY ISSUE: The primary_issue field identifies the single largest structural gap. Select based on the gap with the highest weight × severity product from the gap analysis. For the same gap profile, always select the same primary issue. Do not vary between runs.),
  "predicted_signal_lift": {"dimensions":[{"dimension":"string","lift":number}],"current_score":number,"predicted_score":number} (DETERMINISTIC PREDICTED SCORE FORMULA — CRITICAL: Each dimension "lift" represents the realistic maximum improvement in percentage points (typically 5-8 per dimension). These lifts are generated independently by the model based on gap severity — NOT derived from the 0.50 formula. The 0.50 formula applies ONLY to the final predicted_score calculation: sum all dimension lift values, multiply by 0.50, add to current_score, round to nearest integer, cap at current_score + 15. The 0.50 rate does NOT affect individual lift values. Example: lifts 7+6+6+7=26, 26×0.50=13, current 58+13=71. The individual lifts must remain realistic model judgments.),
  "debug": {"mode":"${mode}","user_plan":"${userPlan}","bullet_count_requested":${userPlan === "pro" ? 3 : 1},"extracted_jd_priorities":[{"priority":"string","weight":number,"evidence":"string"}],"scoring_breakdown":{"role_outcomes_alignment":number,"tools_and_workflow_alignment":number,"domain_and_context_alignment":number,"context_and_scale_alignment":number,"communication_and_leadership_alignment":number}}
}

Identity_strength_index pillars: exactly 4 (Role Signal Clarity, Commercial Framing Power, Risk Compression Strength, Narrative Cohesion), each 0-25, strict evidence-based.

SCORE_RATIONALE CLASSIFICATION (CRITICAL):
Each score_rationale bullet MUST be prefixed with exactly '[STRENGTH]' or '[GAP]':
- '[STRENGTH]' = the candidate's resume demonstrably evidences this signal (e.g. "aligns with", "demonstrates", "shows", "translates to", "evidenced by")
- '[GAP]' = the resume is missing this signal or it is weak/absent (e.g. "missing", "lacks", "no evidence of", "absent", "unclear", "not demonstrated")
Do NOT mix — a bullet describing something the candidate HAS is always [STRENGTH], never [GAP].
Generate exactly 4 [STRENGTH] bullets. Not 3, not 5. Exactly 4 — the four strongest transferable signals from the resume relative to the JD priority signals. Always return 4 [STRENGTH] items.
Generate exactly 4 [GAP] bullets. Not 3, not 5. Exactly 4 — the four most critical absent signals relative to the JD priority signals. Always return 4 [GAP] items.
The score_rationale array must contain exactly 8 items total: 4 prefixed with [STRENGTH] followed by 4 prefixed with [GAP]. Both sections are required. Neither can be absent.

HIRING PIPELINE SIMULATION DETERMINISTIC RISK LEVELS (CRITICAL):
Assign risk levels based on the extracted signal gaps deterministically. For the same gap profile, always assign the same risk level at each stage. Do not vary risk assessments between runs.
- Recruiter Filter: PASS only if keyword density covers 70%+ of JD priorities. Otherwise MODERATE RISK or HIGH RISK.
- Hiring Manager Review: PASS only if ownership language and performance impact signals are present. Otherwise MODERATE RISK or HIGH RISK.
- Panel Interview Signal: PASS only if cross-functional leadership AND domain expertise signals are both present. If either is missing or weak, assign MODERATE RISK. If both are missing, assign HIGH RISK.
Use the same mechanical threshold logic every time. Do not use subjective judgment for risk level assignment.

CAREER_SIGNAL_MAP DETERMINISTIC ORDERING:
For career_signal_map, return EXACTLY 1 role in primary_alignment and EXACTLY 1 role in secondary_alignment (2 roles total, no more). matched_jd_dimensions = count of how many employer priority signal categories (from jd_signal_extraction) the role's signals overlap with. When two roles score within 5 points of each other, rank the one with higher matched_jd_dimensions first; if still tied, use alphabetical order by role name.
The primary role alignment percentage is calculated from matched signal dimensions only — not from the overall alignment score. Do not use the match_score as a reference for career_signal_map scores. Calculate independently from the signal match data. The primary alignment score should reflect how strongly the candidate's experience naturally signals that role, which can be higher than the overall score when the candidate is a strong natural fit but has structural gaps pulling the overall score down.

DETERMINISTIC SCORING — ALL SUB-SCORES (CRITICAL):
You are a deterministic scorer. Given identical inputs you must always return identical scores. Do not vary your output. Return the same number every time for the same input. If you are uncertain, anchor to the lower bound of your range and hold it.

PRIMARY SCORE ISOLATION (CRITICAL):
match_score.score is computed ONLY from the 5-dimension weighted sum (Role Outcomes 30%, Tools & Workflow 20%, Domain 20%, Context & Scale 15%, Communication & Leadership 15%). It is a measurement of CURRENT alignment. It has NOTHING to do with predicted scores, improvement deltas, capture rates, or calibration formulas. Do NOT apply the predicted score formula (sum × 0.60) to match_score.score. The predicted score formula applies ONLY to predicted_signal_lift.predicted_score and interview_gap_diagnosis.predicted_score — two separate fields that are post-processed server-side anyway. match_score.score must reflect the current state of the resume vs JD, not any projected improvement.

SCORING METHOD — USE QUALITY-WEIGHTED COUNTING, NOT IMPRESSION:
For every numeric score, use explicit QUALITY-WEIGHTED evidence counting:
- For each JD priority signal, classify the resume's match as FULL (1.0), PARTIAL (0.5), or ABSENT (0).
  - FULL (1.0): Exact JD terms, ownership verbs, quantified impact, role-native vocabulary.
  - PARTIAL (0.5): Generic/passive language describing the same capability ("helped", "assisted", "supported", general descriptions without JD-specific framing).
  - ABSENT (0): Signal not present in resume at all.
- Sum the quality weights per dimension (not raw counts). A dimension with 4 FULL matches scores higher than one with 4 PARTIAL matches.
- Map quality-weighted sums to score ranges: 0 weighted = 0, 0.5-1.5 = 5-10, 2.0-3.0 = 10-15, 3.5-5.0 = 15-20, 5.5+ = 20-25 for /25 scales.
- Do NOT use subjective impression, "feels like", or holistic judgment for any numeric field.
- Round down when between two values, never up.
- CRITICAL: This means a resume using "drove cross-functional GTM strategy" scores HIGHER than one saying "helped with product launches" for the same JD signal — because the first is a FULL match (1.0) and the second is a PARTIAL match (0.5).

This applies individually and explicitly to EACH of these numeric fields — score each one deterministically:
- match_score.score: quality-weighted sum of 5 dimensions, no rounding variance
- identity_strength_index.total_score AND each pillar score (all 4): assign fixed points based strictly on quality-weighted evidence per pillar
- signal_map: ALL 6 dimensions — each scored by quality-weighted keyword matches between resume and JD
- signal_shift_estimates: all before/after pairs on 0-100 percentage scale — independently assessed signal strength percentages, NOT derived from signal_map /25 scores
- hiring_signal_benchmark: user_score, median_candidate_score, top_candidate_threshold, and all dimension_comparison scores
- career_signal_map: role scores for both primary and secondary
- predicted_signal_lift: all dimension lifts and current/predicted scores — lifts must be derived from gap counts, not estimated
- interview_gap_diagnosis: current_score and predicted_score

For each numeric field: classify match quality, apply quality weights, use scoring rubric mechanically, produce the same output. No randomness, no creativity in scoring, no approximation.

STRATEGIC FIXES COUNT (CRITICAL):
interview_gap_diagnosis.strategic_fixes must contain EXACTLY 3 items. Not 2, not 4. Exactly 3, ranked by impact on the match score. The section heading is always "Three Strategic Fixes" so the list must always contain 3 items.

STYLE: No "results-driven"/"leveraging synergies"/"passionate about". Lead with evidence. Operational language. Vary cadence. No markdown/code fences.

EXPERIENCE_INPUT: ${cleanBullet}

JOB_DESCRIPTION: ${cleanJd}

USER_PLAN: ${userPlan}`;

    let titan: Record<string, unknown>;
    
    // First attempt
    let content = await callAI(apiKey, prompt, 5000);
    try {
      titan = extractJSON(content);
    } catch (firstErr) {
      console.error("First parse attempt failed. Preview:", content.slice(0, 300));
      
      // Retry with strict JSON instruction
      console.log("Retrying with strict JSON instruction...");
      const strictNote = "CRITICAL: Return only a valid JSON object. No markdown, no code fences, no preamble, no explanation. Start your response with { and end with }.";
      const retryContent = await callAI(apiKey, prompt, 5000, strictNote);
      try {
        titan = extractJSON(retryContent);
      } catch (secondErr) {
        console.error("Second parse attempt also failed. Preview:", retryContent.slice(0, 300));
        throw new Error("Signal calibration response could not be processed. Please try again.");
      }
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

    // Map Titan contract to the shape the frontend expects
    const optimizedBullet = titan.optimized_bullets?.[0]?.text || "";
    const matchScore = titan.match_score?.score ?? 0;
    const confidenceLevel = titan.match_score?.label || "";
    const missingKeywords = titan.missing_keywords || [];
    const suggestedVerbs = titan.suggested_action_verbs || [];
    const alignmentNotes = titan.alignment_intelligence_summary || "";
    const gapSuggestions = titan.strategic_gap_actions?.length
      ? titan.strategic_gap_actions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")
      : null;

    const altA = titan.optimized_bullets?.[1]?.text || optimizedBullet;
    const altB = titan.optimized_bullets?.[2]?.text || optimizedBullet;

    const priorities = titan.debug?.extracted_jd_priorities || [];
    const topMatchedSignal = priorities.length > 0 ? priorities[0].priority : null;
    const topMissingSignal = missingKeywords.length > 0 ? missingKeywords[0] : null;

    const breakdown = titan.debug?.scoring_breakdown || {};
    const scoreRationale = titan.match_score?.score_rationale || [];

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
      strengths: (titan.resume_signal_profile
        ? Object.entries(titan.resume_signal_profile as Record<string, any>)
            .filter(([, v]) => v?.strength === "Strong" || v?.strength === "Moderate")
            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.evidence?.[0] || v.strength}`)
        : []),
      gaps: (titan.signal_alignment_analysis as any[] || [])
        .filter((a: any) => a.alignment_level === "Weak" || a.alignment_level === "Missing")
        .map((a: any) => a.perception_gap || a.category),
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
        const igd = titan.interview_gap_diagnosis as any;
        if (!igd) return null;
        // Use the same mechanical formula for predicted_score
        const psl = titan.predicted_signal_lift as any;
        const currentScore = igd.current_score ?? (titan.match_score as any)?.score ?? 0;
        if (psl && Array.isArray(psl.dimensions)) {
          const totalLift = psl.dimensions.reduce((sum: number, d: any) => sum + (d.lift ?? 0), 0);
          const captured = Math.round(totalLift * 0.50);
          const predictedScore = Math.min(currentScore + captured, currentScore + 15);
          return { ...igd, current_score: currentScore, predicted_score: predictedScore };
        }
        return igd;
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
    };

    // Save to database
    await sb.from("optimizations").insert({
      user_id: userId || null,
      input_bullet: cleanBullet,
      input_jd: cleanJd,
      optimized_bullet: optimizedBullet,
      match_score: Math.round(matchScore),
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
    }).throwOnError();

    // Cache the result for repeat analyses
    setCache(cacheKey, result);

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
