/**
 * Client-side deterministic scoring engine.
 * 4-component rubric:
 *   1. JD Mirroring Score        (40%)
 *   2. Ownership & Scope Density (30%)
 *   3. Perception Gap Closure    (20%)
 *   4. Readability & Signal Density (10%)
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","your","you","our","are","was","were","have","has","had","will","can","must","should","into","onto","through","across","over","under","about","within","between","using","use","used","their","they","them","job","role","position","candidate","required","preferred","responsibilities","requirements","experience","ability","skills","skill","work","working","team","teams","customer","customers","service","services","business",
]);

const STRONG_OWNERSHIP_VERBS = [
  "led","drove","owned","spearheaded","architected","orchestrated","directed","launched","built","scaled","implemented","executed","transformed","championed","governed","delivered","established","redesigned","pioneered","devised","instituted","restructured","consolidated","mobilized","accelerated","elevated","oversaw","administered","standardized","created","developed","designed","automated","negotiated","facilitated","optimized","revamped","formulated","engineered","deployed","maintained","resolved","streamlined","trained","mentored","supervised",
];

const PARTIAL_OWNERSHIP_VERBS = [
  "managed","coordinated","responsible for","handled","worked on","contributed to","involved in","engaged","tracked","monitored","reviewed","prepared","processed","compiled","organized","planned","conducted","performed","served",
];

const PASSIVE_PHRASES = [
  "helped","assisted","supported","participated in","was involved","tasked with",
];

const SCOPE_INDICATORS_RE = /(?:\$\s?\d[\d,.]*\s?[kmb]?(?:illion)?|\b\d+(?:\.\d+)?\s?%|\b\d+[x×]|\b\d+\+?\s?(?:team|teams|people|members|staff|engineers|reports|employees|headcount|users|customers|clients|accounts|projects|locations|regions|departments|stakeholders|hours|days|weeks|months|years|sites|offices|vendors|partners|units)|\bcross[- ]?functional\b|\bend[- ]?to[- ]?end\b|\benterprise[- ]?wide\b|\bglobal\b|\bregional\b|\bmulti[- ]?site\b|\bhigh[- ]?volume\b|\bportfolio\b|\bprogram\b|\bp&l\b|\bbudget\b|\brevenue\b|\bgovernance\b)/gi;

// Senior-level language signals in JDs
const SENIOR_LANGUAGE = [
  "strategic","led","owned","drove","spearheaded","architected","governed","p&l","cross-functional","cross functional","executive","stakeholder governance","decision-making","decision making","accountability","end-to-end","end to end","enterprise","portfolio","roadmap","transformation","scaled","built","launched",
];

// Junior-level language signals in JDs
const JUNIOR_LANGUAGE = [
  "assisted","supported","helped","participated","contributed","involved","tasked","entry-level","entry level","junior","intern","trainee","associate",
];

const OUTCOME_TERMS = [
  "increased","reduced","improved","grew","saved","delivered","achieved","exceeded","decreased","boosted","lowered","raised","generated","optimized","reducing","improving","streamlined","standardizing","minimized","eliminated","enhancing","resulting in","leading to","which led to","driving","enabling",
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

// ─── Section Extraction ──────────────────────────────────────────────────────

interface ResumeSections {
  bullets: string[];       // Experience bullet lines
  skillsText: string;      // Text from skills sections
  summaryText: string;     // Professional summary text
  fullText: string;
}

function extractSections(resumeText: string): ResumeSections {
  const lines = resumeText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  const skillLines: string[] = [];
  const summaryLines: string[] = [];
  let currentSection = "other";

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Detect section headers
    if (/^(skills|technical\s+skills|core\s+competencies|technologies|tools)\s*[:：]?\s*$/i.test(line) ||
        /^(skills|technical\s+skills|core\s+competencies)\b/i.test(line) && line.length < 40) {
      currentSection = "skills";
      continue;
    }
    if (/^(summary|professional\s+summary|profile|objective|about)\s*[:：]?\s*$/i.test(line) ||
        /^(summary|professional\s+summary|profile)\b/i.test(line) && line.length < 40) {
      currentSection = "summary";
      continue;
    }
    if (/^(experience|work\s+experience|employment|professional\s+experience|career)\s*[:：]?\s*$/i.test(line) ||
        /^(experience|work\s+experience|employment)\b/i.test(line) && line.length < 50) {
      currentSection = "experience";
      continue;
    }
    if (/^(education|certifications?|awards?|publications?|projects?)\s*[:：]?\s*$/i.test(line)) {
      currentSection = "other";
      continue;
    }

    // Classify line
    const isBulletLike = /^[-•●○◦▪▸–—]/.test(line) || /^\d+[.)]\s/.test(line) || line.length > 20;

    if (currentSection === "skills") {
      skillLines.push(line);
    } else if (currentSection === "summary") {
      summaryLines.push(line);
    } else if (currentSection === "experience" && isBulletLike && line.length > 15) {
      bullets.push(line.replace(/^[-•●○◦▪▸–—]\s*/, "").replace(/^\d+[.)]\s*/, ""));
    } else if (currentSection === "other" && isBulletLike && line.length > 15) {
      // If no explicit experience section, treat long bullet-like lines as bullets
      bullets.push(line.replace(/^[-•●○◦▪▸–—]\s*/, "").replace(/^\d+[.)]\s*/, ""));
    }
  }

  return {
    bullets,
    skillsText: skillLines.join(" "),
    summaryText: summaryLines.join(" "),
    fullText: resumeText,
  };
}

// ─── Semantic Equivalence Map ────────────────────────────────────────────────
// Bidirectional concept clusters: if a JD keyword matches any term in a cluster,
// resume terms from the SAME cluster receive partial semantic credit.

const SEMANTIC_CLUSTERS: string[][] = [
  ["escalation", "issue resolution", "complaint", "dispute", "conflict resolution", "grievance", "case management"],
  ["sla", "service level", "service performance", "performance accountability", "service standard", "quality assurance"],
  ["complaint routing", "case management", "ticket management", "issue workflow", "case routing", "intake"],
  ["cross-functional", "cross functional", "department collaboration", "interdepartmental", "multi-team", "cross-team", "collaborative"],
  ["process improvement", "process documentation", "operational efficiency", "workflow optimization", "continuous improvement", "process standardization", "lean", "six sigma"],
  ["customer service", "customer support", "client service", "client support", "customer experience", "customer success", "customer relations", "client relations"],
  ["leadership", "management", "supervision", "team lead", "team management", "people management", "staff management", "direct reports"],
  ["training", "coaching", "mentoring", "onboarding", "development", "upskilling"],
  ["reporting", "analytics", "dashboards", "metrics", "kpi", "data analysis", "performance tracking"],
  ["scheduling", "workforce planning", "capacity planning", "resource allocation", "staffing"],
  ["vendor management", "supplier management", "third-party management", "partner management", "vendor relations"],
  ["budget", "cost management", "p&l", "financial oversight", "cost reduction", "expense management"],
  ["compliance", "regulatory", "audit", "policy", "governance", "risk management"],
  ["stakeholder", "executive", "senior leadership", "c-suite", "board", "sponsor"],
  ["retail", "store operations", "floor management", "merchandising", "point of sale", "inventory"],
  ["operations", "operational", "ops", "logistics", "supply chain", "fulfillment", "distribution"],
];

function findSemanticCredit(keyword: string, resumeText: string): number {
  const kwLower = keyword.toLowerCase();
  const resumeLower = resumeText.toLowerCase();

  for (const cluster of SEMANTIC_CLUSTERS) {
    // Check if the JD keyword matches any term in this cluster
    const kwInCluster = cluster.some(term => {
      if (term.length <= 4) return kwLower === term;
      return kwLower.includes(term) || term.includes(kwLower);
    });

    if (!kwInCluster) continue;

    // Check if the resume contains any OTHER term from the same cluster
    let bestMatch = 0;
    for (const term of cluster) {
      if (term.includes(kwLower) || kwLower.includes(term)) continue; // skip self-matches
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const rx = new RegExp(`\\b${escaped}\\b`, "i");
      if (rx.test(resumeLower)) {
        // Longer matching terms get higher credit (more specific = more valuable)
        const credit = Math.min(0.65, 0.4 + (term.length / 40));
        bestMatch = Math.max(bestMatch, credit);
      }
    }

    if (bestMatch > 0) return bestMatch;
  }

  return 0;
}

// ─── JD Signal Vocabulary ────────────────────────────────────────────────────

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

  // Extract bigrams from JD
  const sentences = jdText.toLowerCase().split(/[\n.;:!?]+/).map((s) => s.trim()).filter(Boolean);
  const bigramFreq = new Map<string, number>();
  for (const sentence of sentences) {
    const words = tokenize(sentence).filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      bigramFreq.set(bi, (bigramFreq.get(bi) || 0) + 1);
    }
  }

  const bigrams = [...bigramFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, 10)
    .map(([phrase]) => phrase);

  return { keywords, bigrams, stemmedKeywords };
}

// ─── Sanitization ────────────────────────────────────────────────────────────

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

// ─── Component 1: JD Mirroring Score (40%) ───────────────────────────────────

function computeJdMirroringScore(sections: ResumeSections, jdModel: ReturnType<typeof buildJdSignalVocabulary>): number {
  const bulletsText = sections.bullets.join(" ").toLowerCase();
  const bulletsTokens = tokenize(bulletsText);
  const bulletsTokenSet = new Set(bulletsTokens);
  const bulletsStemSet = new Set(bulletsTokens.map(stem).filter(s => s.length >= 3));

  const skillsTokens = tokenize(sections.skillsText.toLowerCase());
  const skillsTokenSet = new Set(skillsTokens);

  // Count keyword matches in bullets
  let bulletKeywordHits = 0;
  let skillsOnlyHits = 0;

  for (const kw of jdModel.keywords) {
    const inBullets = bulletsTokenSet.has(kw);
    const inBulletsStemmed = bulletsStemSet.has(stem(kw));
    const inSkillsOnly = !inBullets && !inBulletsStemmed && skillsTokenSet.has(kw);

    if (inBullets) bulletKeywordHits += 1.0;
    else if (inBulletsStemmed) bulletKeywordHits += 0.90;
    else if (inSkillsOnly) skillsOnlyHits += 1;
  }

  const maxKeywords = Math.max(jdModel.keywords.length, 1);
  const bulletKeywordCoverage = bulletKeywordHits / maxKeywords;
  // Skills-only matches contribute at 50% value (reduced penalty)
  const skillsOnlyPenalized = (skillsOnlyHits * 0.5) / maxKeywords;

  // Bigram matches in bullets — weight lead-position matches higher
  let bigramScore = 0;
  for (const bigram of jdModel.bigrams) {
    const escaped = bigram.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "i");

    // Check if bigram appears in bullet lead (first 8 words)
    let leadMatch = false;
    let anyMatch = false;
    for (const bullet of sections.bullets) {
      const lower = bullet.toLowerCase();
      if (rx.test(lower)) {
        anyMatch = true;
        const leadWords = lower.split(/\s+/).slice(0, 8).join(" ");
        if (rx.test(leadWords)) {
          leadMatch = true;
          break;
        }
      }
    }

    if (leadMatch) bigramScore += 1.0;
    else if (anyMatch) bigramScore += 0.6;
  }

  const maxBigrams = Math.max(jdModel.bigrams.length, 1);
  const bigramCoverage = bigramScore / maxBigrams;

  // Final JD Mirroring = bullet keyword coverage (50%) + bigram coverage (30%) + skills-only (20%)
  // Apply sqrt curve to prevent low-partial-match scores from collapsing toward zero
  const raw = (bulletKeywordCoverage * 0.50) + (bigramCoverage * 0.30) + (skillsOnlyPenalized * 0.20);
  const curved = Math.sqrt(clamp01(raw)); // sqrt curve lifts mid-range scores
  return Math.floor(100 * curved);
}

// ─── Component 2: Ownership & Scope Density (30%) ────────────────────────────

function computeOwnershipScopeScore(sections: ResumeSections): number {
  const { bullets } = sections;
  if (bullets.length === 0) return 0;

  let totalScore = 0;

  for (const bullet of bullets) {
    const lower = bullet.toLowerCase();
    const words = lower.split(/\s+/);
    const leadWord = words[0] || "";

    // Check ownership verb in lead position
    const hasStrongOwnership = STRONG_OWNERSHIP_VERBS.some(v => leadWord.startsWith(v) || lower.startsWith(v));
    const hasPartialOwnership = !hasStrongOwnership && PARTIAL_OWNERSHIP_VERBS.some(v => lower.startsWith(v));
    const isPassive = PASSIVE_PHRASES.some(v => lower.startsWith(v));

    // Check scope indicators
    const scopeMatches = bullet.match(SCOPE_INDICATORS_RE);
    const hasScope = scopeMatches !== null && scopeMatches.length > 0;

    // Check for outcome/impact language
    const hasOutcome = OUTCOME_TERMS.some(t => {
      const rx = new RegExp(`\\b${t}\\b`, "i");
      return rx.test(bullet);
    });

    const hasScopeOrOutcome = hasScope || hasOutcome;

    if (isPassive) {
      totalScore += 0; // Passive = zero
    } else if (hasStrongOwnership && hasScopeOrOutcome) {
      totalScore += 1.0; // Full points
    } else if (hasStrongOwnership || (hasPartialOwnership && hasScopeOrOutcome)) {
      totalScore += 0.6; // Partial: strong verb alone OR partial verb + scope
    } else if (hasPartialOwnership) {
      totalScore += 0.4; // Partial verb, no scope — still shows ownership
    } else if (hasScopeOrOutcome) {
      totalScore += 0.35; // Scope but no ownership verb lead
    } else {
      totalScore += 0.15; // Neutral: not passive but nothing special
    }
  }

  const density = totalScore / bullets.length;
  return Math.floor(100 * clamp01(density));
}

// ─── Component 3: Perception Gap Closure (20%) ──────────────────────────────

function computePerceptionGapScore(sections: ResumeSections, jdText: string): number {
  const jdLower = jdText.toLowerCase();
  const resumeLower = (sections.bullets.join(" ") + " " + sections.summaryText).toLowerCase();

  // Determine JD seniority level
  const seniorHitsJd = countPhraseHits(jdLower, SENIOR_LANGUAGE);
  const juniorHitsJd = countPhraseHits(jdLower, JUNIOR_LANGUAGE);
  const jdTokenCount = tokenize(jdText).length;

  const seniorDensityJd = toDensityPer100Words(seniorHitsJd, jdTokenCount);
  const juniorDensityJd = toDensityPer100Words(juniorHitsJd, jdTokenCount);

  // -1 (very junior) to +1 (very senior)
  const jdSenioritySignal = clamp01((seniorDensityJd * 2) / Math.max(seniorDensityJd + juniorDensityJd + 0.5, 1));

  // Measure resume seniority language
  const resumeTokens = tokenize(resumeLower);
  const seniorHitsResume = countPhraseHits(resumeLower, SENIOR_LANGUAGE);
  const juniorHitsResume = countPhraseHits(resumeLower, JUNIOR_LANGUAGE);
  const passiveHitsResume = countPhraseHits(resumeLower, PASSIVE_PHRASES);

  const seniorDensityResume = toDensityPer100Words(seniorHitsResume, resumeTokens.length);
  const juniorDensityResume = toDensityPer100Words(juniorHitsResume, resumeTokens.length);
  const passiveDensityResume = toDensityPer100Words(passiveHitsResume, resumeTokens.length);

  const resumeSenioritySignal = clamp01((seniorDensityResume * 2) / Math.max(seniorDensityResume + juniorDensityResume + passiveDensityResume + 0.5, 1));

  // Score = how closely resume matches JD's implied level
  // Use a softer gap penalty: square the gap so moderate mismatches are gentle
  const gap = Math.abs(jdSenioritySignal - resumeSenioritySignal);
  const levelMatch = 1 - (gap * gap); // quadratic: 0.3 gap → 0.91, 0.5 gap → 0.75

  // Softer passive penalty
  const passivePenalty = clamp01(passiveDensityResume / 3) * 0.2;

  const raw = clamp01(levelMatch - passivePenalty);
  return Math.floor(100 * raw);
}

// ─── Component 4: Readability & Signal Density (10%) ────────────────────────

function computeReadabilityScore(sections: ResumeSections): number {
  const { bullets } = sections;
  if (bullets.length === 0) return 50; // neutral default

  let totalPenalty = 0;
  let passiveCount = 0;
  let validBullets = 0;

  for (const bullet of bullets) {
    const words = bullet.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    validBullets++;

    // Penalize bullets under 15 words or over 50 words
    if (wordCount < 15) {
      totalPenalty += 0.3 * ((15 - wordCount) / 15); // More penalty for shorter
    } else if (wordCount > 50) {
      totalPenalty += 0.3 * ((wordCount - 50) / 50);
    }

    // Passive construction penalty
    const lower = bullet.toLowerCase();
    if (PASSIVE_PHRASES.some(p => lower.includes(p))) {
      passiveCount++;
    }
  }

  const avgPenalty = totalPenalty / validBullets;
  const passiveRate = passiveCount / validBullets;

  // Score: start at 100, subtract penalties
  const raw = clamp01(1 - avgPenalty - (passiveRate * 0.4));
  return Math.floor(100 * raw);
}

// ─── Signal Measurement (for delta validation) ──────────────────────────────

interface SignalSnapshot {
  ownershipDensity: number;
  keywordCoverage: number;
  verbLeadRate: number;
  outcomeDensity: number;
  passiveDensity: number;
}

function measureSignals(resumeText: string, jdModel: ReturnType<typeof buildJdSignalVocabulary>): SignalSnapshot {
  const normalized = normalizeText(resumeText);
  const sanitized = sanitizeInput(normalized);
  const tokens = tokenize(sanitized);
  const tokenSet = new Set(tokens);
  const lower = sanitized.toLowerCase();

  const ownershipStrong = countPhraseHits(lower, STRONG_OWNERSHIP_VERBS);
  const passiveHits = countPhraseHits(lower, PASSIVE_PHRASES);
  const outcomeHits = countPhraseHits(lower, OUTCOME_TERMS);
  const quantifiedHits = (lower.match(/(?:\$\s?\d+[\d,.]*\s?[kmb]?|\b\d+(?:\.\d+)?\s?%|\b\d+[x×]|\b\d+\s?(?:customers|clients|teams|projects|accounts|locations|regions|departments|stakeholders|hours|days|weeks|months|years))\b/gi) || []).length;

  const exactHits = jdModel.keywords.reduce((s, t) => s + (tokenSet.has(t) ? 1 : 0), 0);
  const stemSet = new Set(tokens.map(stem).filter(s => s.length >= 3));
  const stemHits = jdModel.stemmedKeywords.reduce((s, t) => s + (stemSet.has(t) ? 1 : 0), 0);
  const keywordCoverage = Math.max(
    exactHits / Math.max(jdModel.keywords.length, 1),
    (stemHits / Math.max(jdModel.stemmedKeywords.length, 1)) * 0.92,
  );

  const bulletLines = sanitized.split(/\n/).map(l => l.trim()).filter(l => l.length > 15);
  const allLeadVerbs = [...STRONG_OWNERSHIP_VERBS, ...PARTIAL_OWNERSHIP_VERBS];
  const verbLedCount = bulletLines.reduce((count, line) => {
    const lineLower = line.toLowerCase();
    return count + (allLeadVerbs.some(v => lineLower.startsWith(v)) ? 1 : 0);
  }, 0);

  return {
    ownershipDensity: toDensityPer100Words(ownershipStrong, tokens.length),
    keywordCoverage,
    verbLeadRate: bulletLines.length > 0 ? verbLedCount / bulletLines.length : 0,
    outcomeDensity: toDensityPer100Words(outcomeHits + quantifiedHits, tokens.length),
    passiveDensity: toDensityPer100Words(passiveHits, tokens.length),
  };
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

export function computeDeterministicScore(
  resumeText: string,
  jdText: string,
  runType: RunType = "original",
  originalResumeText?: string,
): DeterministicScoreResult {
  const normalizedResume = normalizeText(resumeText);
  const sanitizedResume = sanitizeInput(normalizedResume);
  const sections = extractSections(sanitizedResume);
  const jdModel = buildJdSignalVocabulary(jdText);

  // ─── 4-Component Scoring ──────────────────────────────────────────────────
  const jdMirroringScore = computeJdMirroringScore(sections, jdModel);           // 0-100
  const ownershipScopeScore = computeOwnershipScopeScore(sections);              // 0-100
  const perceptionGapScore = computePerceptionGapScore(sections, jdText);        // 0-100
  const readabilityScore = computeReadabilityScore(sections);                    // 0-100

  // Final weighted score: 40% + 30% + 20% + 10%
  const weightedSum =
    (jdMirroringScore * 0.40) +
    (ownershipScopeScore * 0.30) +
    (perceptionGapScore * 0.20) +
    (readabilityScore * 0.10);

  // Apply lower-bound scaling: resumes with any meaningful signal shouldn't collapse below ~40
  // This uses a linear remap from [0-100] to [floor-100] where floor scales with raw score
  const rawBase = Math.floor(weightedSum);
  const signalFloor = rawBase > 10 ? Math.min(rawBase, 40) * (rawBase / 100) : 0;
  const baseScore = Math.max(rawBase, Math.floor(signalFloor));
  let finalScore = baseScore;

  // ─── Map 4 components to 5-field breakdown for backward compatibility ────
  // role_outcomes_alignment ← Ownership & Scope (primary driver)
  // tools_and_workflow_alignment ← JD Mirroring (keyword/bigram alignment)
  // domain_and_context_alignment ← Perception Gap Closure
  // context_and_scale_alignment ← blend of Ownership + JD Mirroring scope
  // communication_and_leadership_alignment ← blend of Perception Gap + Ownership
  const role_outcomes_alignment = ownershipScopeScore;
  const tools_and_workflow_alignment = jdMirroringScore;
  const domain_and_context_alignment = perceptionGapScore;
  const context_and_scale_alignment = Math.floor((ownershipScopeScore * 0.5 + jdMirroringScore * 0.5));
  const communication_and_leadership_alignment = Math.floor((perceptionGapScore * 0.5 + ownershipScopeScore * 0.5));

  // ─── Calibrated-language signal boost with delta-validation ───────────────
  if (runType === "calibrated" && originalResumeText) {
    const nowSignals = measureSignals(sanitizedResume, jdModel);
    const origSignals = measureSignals(originalResumeText, jdModel);

    // Compute deltas (positive = improvement)
    const deltaOwnership = nowSignals.ownershipDensity - origSignals.ownershipDensity;
    const deltaKeywordCov = nowSignals.keywordCoverage - origSignals.keywordCoverage;
    const deltaVerbRate = nowSignals.verbLeadRate - origSignals.verbLeadRate;
    const deltaOutcome = nowSignals.outcomeDensity - origSignals.outcomeDensity;
    const deltaPassive = origSignals.passiveDensity - nowSignals.passiveDensity; // reduction is positive

    // Validate: at least 3 of 5 dimensions must show improvement
    const improvementFlags = [
      deltaOwnership > 0.05,
      deltaKeywordCov > 0.05,
      deltaVerbRate > 0.05,
      deltaOutcome > 0.03,
      deltaPassive > 0.02,
    ];
    const improvementCount = improvementFlags.filter(Boolean).length;
    const hasValidatedImprovement = improvementCount >= 3;

    // Anti-stuffing gate
    const resumeTokens = tokenize(sanitizedResume);
    const maxKeywordFreq = jdModel.keywords.reduce((mx, token) => {
      const count = resumeTokens.filter(t => t === token).length;
      return Math.max(mx, count);
    }, 0);
    const isKeywordStuffed = maxKeywordFreq > 6;

    // Absolute quality gates
    const meetsQualityGates =
      nowSignals.ownershipDensity >= 0.35 &&
      nowSignals.keywordCoverage >= 0.45 &&
      nowSignals.verbLeadRate >= 0.75;

    if (hasValidatedImprovement && meetsQualityGates && !isKeywordStuffed) {
      const BASELINE_SCORE = 59;
      const boostFloor = BASELINE_SCORE + 8; // minimum 67
      const deltaIntensity = clamp01(
        (clamp01(deltaOwnership / 0.30) * 0.25) +
        (clamp01(deltaKeywordCov / 0.30) * 0.25) +
        (clamp01(deltaVerbRate / 0.20) * 0.20) +
        (clamp01(deltaOutcome / 0.20) * 0.15) +
        (clamp01(deltaPassive / 0.15) * 0.15)
      );
      const boostTarget = boostFloor + Math.round(deltaIntensity * 3); // 67–70
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
