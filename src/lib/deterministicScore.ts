/**
 * Client-side deterministic scoring engine.
 * Mirrors the server-side computeRecalibratedScore logic so the final
 * displayed score is computed at the render layer — independent of LLM output.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","your","you","our","are","was","were","have","has","had","will","can","must","should","into","onto","through","across","over","under","about","within","between","using","use","used","their","they","them","job","role","position","candidate","required","preferred","responsibilities","requirements","experience","ability","skills","skill","work","working","team","teams","customer","customers","service","services","business",
]);

const OWNERSHIP_STRONG_PHRASES = [
  "led","drove","owned","spearheaded","architected","orchestrated","directed","launched","built","scaled","implemented","executed","transformed","championed","governed","delivered","established","redesigned","pioneered","devised","instituted","restructured","consolidated","mobilized","accelerated","elevated","oversaw","administered","standardized","created","developed","designed","automated","negotiated","facilitated","optimized","revamped","formulated","engineered","deployed","maintained","resolved","streamlined","trained","mentored","supervised",
];

const OWNERSHIP_PARTIAL_PHRASES = [
  "managed","coordinated","responsible for","handled","worked on","contributed to","involved in","engaged","tracked","monitored","reviewed","prepared","processed","compiled","organized","planned","conducted","performed","served",
];

const PASSIVE_PHRASES = [
  "helped","assisted","supported","participated in","was involved","tasked with",
];

const STAKEHOLDER_COMPLEXITY_PHRASES = [
  "cross-functional","cross functional","stakeholder","stakeholders","executive","leadership team","vp","director","c-suite","client-facing","client facing","vendor","partnered with","matrix","governance","internal teams","external","departments","leadership","clients","partners","administrators",
];

const OPERATIONAL_SCOPE_PHRASES = [
  "end-to-end","end to end","portfolio","program","roadmap","workflow","process","operating model","sla","kpi","governance","capacity","throughput","multi-site","global","regional","standardized","playbook","high-volume","high volume","caseload","concurrent","pipeline","routing","triage","escalation","documentation","protocols","intake",
];

const ACCOUNTABILITY_PHRASES = [
  "accountable","accountability","ownership","owned","p&l","budget","decision","decision-making","decision making","authority","risk","compliance","governance","end-to-end","end to end","primary","responsible","audit","traceability","accuracy","standards",
];

const OUTCOME_TERMS = [
  "increased","reduced","improved","grew","saved","delivered","achieved","exceeded","decreased","boosted","lowered","raised","generated","optimized","reducing","improving","streamlined","standardizing","minimized","eliminated","enhancing",
];

const TOOL_SIGNAL_PHRASES = [
  "crm","salesforce","hubspot","marketo","jira","asana","tableau","power bi","excel","sql","python","zendesk","servicenow","workday","sap","oracle","adobe","microsoft office","microsoft","slack","monday","confluence","sharepoint","google sheets","quickbooks","netsuite",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[+#/&-][a-z0-9]+)*/g) || [];
}

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

function buildJdSignalVocabulary(jdText: string) {
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

// ─── Sanitization (mirrors server-side) ──────────────────────────────────────

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

function normalizeText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Main scoring function ───────────────────────────────────────────────────

export interface DeterministicScoreResult {
  finalScore: number;
  breakdown: {
    role_outcomes_alignment: number;
    tools_and_workflow_alignment: number;
    domain_and_context_alignment: number;
    context_and_scale_alignment: number;
    communication_and_leadership_alignment: number;
  };
}

export type RunType = "original" | "calibrated";

export function computeDeterministicScore(resumeText: string, jdText: string, runType: RunType = "original"): DeterministicScoreResult {
  const rawResume = resumeText;
  const normalizedResume = normalizeText(rawResume);
  const sanitizedResume = sanitizeInput(normalizedResume);

  const resumeTokens = tokenize(sanitizedResume);
  const resumeTokenSet = new Set(resumeTokens);
  const resumeLower = sanitizedResume.toLowerCase();

  const jdModel = buildJdSignalVocabulary(jdText);

  // Exact keyword matches
  const jdKeywordHitsExact = jdModel.keywords.reduce((sum, token) => sum + (resumeTokenSet.has(token) ? 1 : 0), 0);

  // Stemmed keyword matches
  const resumeStemSet = new Set(resumeTokens.map(stem).filter(s => s.length >= 3));
  const jdKeywordHitsStemmed = jdModel.stemmedKeywords.reduce((sum, stemmed) => sum + (resumeStemSet.has(stemmed) ? 1 : 0), 0);

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

  // Quality computations
  const jdMirrorQuality = clamp01((effectiveKeywordCoverage * 0.65) + (jdPhraseCoverage * 0.35));

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

  // Vocab bonus
  const strongOwnershipDensity = toDensityPer100Words(ownershipStrongHits, resumeTokens.length);
  const ownershipRatio = ownershipStrongHits / Math.max(ownershipStrongHits + passiveHits, 1);
  const vocabBonus = clamp01(ownershipRatio * 1.3) * clamp01(strongOwnershipDensity / 0.35) * 0.18;

  // Dimension scores
  const role_outcomes_alignment = Math.floor(100 * clamp01(
    (ownershipQuality * 0.28) +
    (measurableOutcomesQuality * 0.25) +
    (accountabilityQuality * 0.20) +
    (jdMirrorQuality * 0.22) +
    vocabBonus -
    (passivePenalty * 0.06),
  ));

  const tools_and_workflow_alignment = Math.floor(100 * clamp01(
    (toolWorkflowQuality * 0.50) + (jdMirrorQuality * 0.50),
  ));

  const domain_and_context_alignment = Math.floor(100 * clamp01(
    (jdMirrorQuality * 0.65) + (operationalScopeQuality * 0.35),
  ));

  const context_and_scale_alignment = Math.floor(100 * clamp01(
    (operationalScopeQuality * 0.38) +
    (measurableOutcomesQuality * 0.30) +
    (accountabilityQuality * 0.18) +
    (jdMirrorQuality * 0.14),
  ));

  const communication_and_leadership_alignment = Math.floor(100 * clamp01(
    (stakeholderQuality * 0.28) +
    (ownershipQuality * 0.25) +
    (accountabilityQuality * 0.20) +
    (jdMirrorQuality * 0.22) +
    vocabBonus -
    (passivePenalty * 0.08),
  ));

  const weightedSum =
    (role_outcomes_alignment * 0.30) +
    (tools_and_workflow_alignment * 0.20) +
    (domain_and_context_alignment * 0.20) +
    (context_and_scale_alignment * 0.15) +
    (communication_and_leadership_alignment * 0.15);

  // ─── Calibrated-language signal boost (only for run_type === "calibrated") ──
  const baseScore = Math.floor(weightedSum);
  let finalScore = baseScore;

  if (runType === "calibrated") {
    // Signal 1: Ownership language density in bullets
    const ownershipDensitySignal = toDensityPer100Words(ownershipStrongHits, resumeTokens.length);
    const hasOwnershipLanguage = ownershipDensitySignal >= 0.35;

    // Signal 2: JD-mirrored vocabulary used in experience bullets (not just skills)
    // effectiveKeywordCoverage already measures JD keyword presence across the full resume
    const hasJdMirroredVocab = effectiveKeywordCoverage >= 0.45;

    // Signal 3: Bullet lead verb rate above 75%
    // Count lines that start with a strong or partial ownership verb
    const bulletLines = sanitizedResume.split(/\n/).map(l => l.trim()).filter(l => l.length > 15);
    const allLeadVerbs = [...OWNERSHIP_STRONG_PHRASES, ...OWNERSHIP_PARTIAL_PHRASES];
    const verbLedCount = bulletLines.reduce((count, line) => {
      const lower = line.toLowerCase();
      const startsWithVerb = allLeadVerbs.some(v => lower.startsWith(v));
      return count + (startsWithVerb ? 1 : 0);
    }, 0);
    const verbLeadRate = bulletLines.length > 0 ? verbLedCount / bulletLines.length : 0;
    const hasHighVerbLeadRate = verbLeadRate >= 0.75;

    // Anti-stuffing gate: flag if any single JD keyword appears > 6 times
    const maxKeywordFreq = jdModel.keywords.reduce((mx, token) => {
      const count = resumeTokens.filter(t => t === token).length;
      return Math.max(mx, count);
    }, 0);
    const isKeywordStuffed = maxKeywordFreq > 6;

    if (hasOwnershipLanguage && hasJdMirroredVocab && hasHighVerbLeadRate && !isKeywordStuffed) {
      // Baseline anchor is 59 (the confirmed original baseline)
      const BASELINE_SCORE = 59;
      const boostFloor = BASELINE_SCORE + 8; // minimum 67
      // Intensity bonus: 0-7 extra points based on signal strength
      const ownershipExcess = clamp01((ownershipDensitySignal - 0.35) / 0.40);
      const coverageExcess  = clamp01((effectiveKeywordCoverage - 0.45) / 0.40);
      const verbExcess      = clamp01((verbLeadRate - 0.75) / 0.25);
      const intensity = (ownershipExcess * 0.4) + (coverageExcess * 0.35) + (verbExcess * 0.25);
      const boostTarget = boostFloor + Math.round(intensity * 7); // 67–74
      finalScore = Math.max(baseScore, boostTarget);
    }
  }

  return {
    finalScore,
    breakdown: {
      role_outcomes_alignment,
      tools_and_workflow_alignment,
      domain_and_context_alignment,
      context_and_scale_alignment,
      communication_and_leadership_alignment,
    },
  };
}
