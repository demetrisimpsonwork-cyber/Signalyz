/**
 * Client-side deterministic scoring engine.
 * 4 sub-scores:
 *   1. JD Mirroring       — weighted n-gram overlap with job description (40%)
 *   2. Ownership & Scope  — active verb counting + stakeholder/scope phrases (30%)
 *   3. Gap Closure         — seniority/impact language shift toward JD target (20%)
 *   4. Readability bonus   — structural quality signals (10%)
 *
 * Overall = 0.40×JD + 0.30×Ownership + 0.20×GapClosure + 0.10×Readability
 *
 * Calibrated resumes that re-run against the same JD will score meaningfully
 * higher (8–15 pts) because they contain repositioned language.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","your","you","our","are","was","were","have","has","had","will","can","must","should","into","onto","through","across","over","under","about","within","between","using","use","used","their","they","them","job","role","position","candidate","required","preferred","responsibilities","requirements","experience","ability","skills","skill","work","working","team","teams","customer","customers","service","services","business","also","well","ensure","including","able","strong","such","etc","per","may","would","could","need","needs","new","make","like","based","provide","support","related","other","various","key","high","both","part","full","level","all","each","any","more","than","most","some","every","many","first","last","great","best","good","one","two","three",
]);

const OWNERSHIP_STRONG = [
  "led","drove","owned","spearheaded","architected","orchestrated","directed","launched","built","scaled","implemented","executed","transformed","championed","governed","delivered","established","redesigned","pioneered","devised","instituted","restructured","consolidated","mobilized","accelerated","elevated","oversaw","administered","standardized","created","developed","designed","automated","negotiated","facilitated","optimized","revamped","formulated","engineered","deployed","maintained","resolved","streamlined","trained","mentored","supervised","defined","introduced","initiated","shaped","influenced","steered",
];

const OWNERSHIP_PARTIAL = [
  "managed","coordinated","responsible for","handled","worked on","contributed to","involved in","engaged","tracked","monitored","reviewed","prepared","processed","compiled","organized","planned","conducted","performed","served",
];

const PASSIVE_PHRASES = [
  "helped","assisted","supported","participated in","was involved","tasked with","aided","attended",
];

const STAKEHOLDER_PHRASES = [
  "cross-functional","cross functional","stakeholder","stakeholders","executive","leadership team","vp","director","c-suite","client-facing","client facing","vendor","partnered with","matrix","governance","internal teams","external","departments","leadership","clients","partners","administrators","board","senior leadership","key stakeholders","business leaders","cross-departmental",
];

const SCOPE_PHRASES = [
  "end-to-end","end to end","portfolio","program","roadmap","workflow","process","operating model","sla","kpi","governance","capacity","throughput","multi-site","global","regional","standardized","playbook","high-volume","high volume","caseload","concurrent","pipeline","routing","triage","escalation","documentation","protocols","intake","enterprise","organization-wide","company-wide","multi-million","large-scale","complex","strategic","comprehensive","holistic",
];

const ACCOUNTABILITY_PHRASES = [
  "accountable","accountability","ownership","owned","p&l","budget","decision","decision-making","decision making","authority","risk","compliance","governance","end-to-end","end to end","primary","responsible","audit","traceability","accuracy","standards","oversight","reporting to","direct report",
];

const OUTCOME_TERMS = [
  "increased","reduced","improved","grew","saved","delivered","achieved","exceeded","decreased","boosted","lowered","raised","generated","optimized","reducing","improving","streamlined","standardizing","minimized","eliminated","enhancing","accelerated","maximized","doubled","tripled","expanded","shortened","cut","drove","resulting in","leading to",
];

const SENIORITY_LANGUAGE = [
  "strategic","strategy","vision","roadmap","transformation","organizational","enterprise","executive","board","charter","initiative","program","portfolio","governance","leadership","influence","stakeholder alignment","business case","roi","value creation","operational excellence","change management","digital transformation","capability building","talent development","succession","organizational design",
];

const IMPACT_LANGUAGE = [
  "revenue","profit","cost savings","efficiency","productivity","growth","market share","customer satisfaction","retention","performance","roi","nps","throughput","capacity","conversion","pipeline","scalability","uptime","quality","compliance rate","adoption","engagement","utilization",
];

const TOOL_PHRASES = [
  "crm","salesforce","hubspot","marketo","jira","asana","tableau","power bi","excel","sql","python","zendesk","servicenow","workday","sap","oracle","adobe","microsoft office","microsoft","slack","monday","confluence","sharepoint","google sheets","quickbooks","netsuite","figma","miro","trello","github","aws","azure","gcp","docker","kubernetes",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
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
    const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const rx = new RegExp(`\\b${escaped}\\b`, "gi");
    return sum + ((text.match(rx) || []).length);
  }, 0);
}

function densityPer100(hits: number, tokenCount: number): number {
  return hits / Math.max(tokenCount / 100, 1);
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

// ─── JD vocabulary extraction ────────────────────────────────────────────────

function buildJdVocab(jdText: string) {
  const jdLower = jdText.toLowerCase();
  const jdTokens = tokenize(jdLower).filter(t => t.length >= 3 && !STOP_WORDS.has(t));

  // Unigram frequency
  const freq = new Map<string, number>();
  for (const t of jdTokens) freq.set(t, (freq.get(t) || 0) + 1);

  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : b[0].length - a[0].length)
    .slice(0, 20)
    .map(([t]) => t);

  const stemmedKw = [...new Set(keywords.map(stem))].filter(s => s.length >= 3);

  // Bigrams & trigrams
  const phraseFreq = new Map<string, number>();
  const sentences = jdLower.split(/[\n.;:!?]+/).map(s => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const words = tokenize(sentence).filter(t => t.length >= 3 && !STOP_WORDS.has(t));
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
    .sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : b[0].length - a[0].length)
    .slice(0, 10)
    .map(([p]) => p);

  return { keywords, stemmedKw, phrases, jdTokens };
}

// ─── Sub-score 1: JD Mirroring (0–100) ──────────────────────────────────────

function scoreJdMirroring(resumeLower: string, resumeTokens: string[], jd: ReturnType<typeof buildJdVocab>): number {
  const resumeTokenSet = new Set(resumeTokens);
  const resumeStemSet = new Set(resumeTokens.map(stem).filter(s => s.length >= 3));

  // Exact unigram coverage
  const exactHits = jd.keywords.reduce((s, k) => s + (resumeTokenSet.has(k) ? 1 : 0), 0);
  const exactCov = exactHits / Math.max(jd.keywords.length, 1);

  // Stemmed coverage
  const stemHits = jd.stemmedKw.reduce((s, k) => s + (resumeStemSet.has(k) ? 1 : 0), 0);
  const stemCov = stemHits / Math.max(jd.stemmedKw.length, 1);

  // Bigram/trigram phrase hits
  const phraseHits = jd.phrases.reduce((s, phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return s + (new RegExp(`\\b${escaped}\\b`, "i").test(resumeLower) ? 1 : 0);
  }, 0);
  const phraseCov = phraseHits / Math.max(jd.phrases.length, 1);

  // Tool/technology overlap with JD
  const jdTools = TOOL_PHRASES.filter(t => jd.jdTokens.some(jt => jt.includes(t.replace(/\s+/g, ""))));
  const toolHits = jdTools.length > 0
    ? jdTools.reduce((s, t) => s + (resumeLower.includes(t) ? 1 : 0), 0) / jdTools.length
    : 0;

  // Weighted combination — emphasise exact + phrase matches
  const raw = (exactCov * 0.30) + (stemCov * 0.25) + (phraseCov * 0.30) + (toolHits * 0.15);

  // Apply a curve that rewards higher coverage more aggressively
  // This makes calibrated resumes (which mirror JD language) score notably higher
  const curved = Math.pow(raw, 0.7); // concave curve rewards improvement

  return Math.floor(clamp01(curved) * 100);
}

// ─── Sub-score 2: Ownership & Scope Density (0–100) ─────────────────────────

function scoreOwnershipScope(resumeLower: string, resumeTokens: string[]): number {
  const tc = resumeTokens.length;
  if (tc === 0) return 0;

  const strongHits = countPhraseHits(resumeLower, OWNERSHIP_STRONG);
  const partialHits = countPhraseHits(resumeLower, OWNERSHIP_PARTIAL);
  const passiveHits = countPhraseHits(resumeLower, PASSIVE_PHRASES);
  const stakeholderHits = countPhraseHits(resumeLower, STAKEHOLDER_PHRASES);
  const scopeHits = countPhraseHits(resumeLower, SCOPE_PHRASES);
  const accountabilityHits = countPhraseHits(resumeLower, ACCOUNTABILITY_PHRASES);

  // Ownership ratio — strong verbs vs passive
  const totalVerbs = strongHits + partialHits + passiveHits;
  const ownershipRatio = totalVerbs > 0
    ? (strongHits * 1.0 + partialHits * 0.5) / totalVerbs
    : 0;

  // Density signals
  const strongDensity = clamp01(densityPer100(strongHits, tc) / 0.30);
  const stakeholderDensity = clamp01(densityPer100(stakeholderHits, tc) / 0.25);
  const scopeDensity = clamp01(densityPer100(scopeHits, tc) / 0.25);
  const accountDensity = clamp01(densityPer100(accountabilityHits, tc) / 0.20);

  // Passive penalty
  const passivePenalty = clamp01(densityPer100(passiveHits, tc) / 0.40) * 0.15;

  const raw =
    (ownershipRatio * 0.25) +
    (strongDensity * 0.25) +
    (stakeholderDensity * 0.20) +
    (scopeDensity * 0.15) +
    (accountDensity * 0.15) -
    passivePenalty;

  // Concave curve to reward dense ownership language
  const curved = Math.pow(clamp01(raw), 0.75);

  return Math.floor(clamp01(curved) * 100);
}

// ─── Sub-score 3: Perception Gap Closure (0–100) ────────────────────────────

function scoreGapClosure(resumeLower: string, resumeTokens: string[], jdLower: string): number {
  const tc = resumeTokens.length;
  if (tc === 0) return 0;

  // Seniority language presence
  const seniorityHits = countPhraseHits(resumeLower, SENIORITY_LANGUAGE);
  const seniorityDensity = clamp01(densityPer100(seniorityHits, tc) / 0.20);

  // Impact/outcome language
  const outcomeHits = countPhraseHits(resumeLower, OUTCOME_TERMS);
  const impactHits = countPhraseHits(resumeLower, IMPACT_LANGUAGE);
  const outcomeDensity = clamp01(densityPer100(outcomeHits, tc) / 0.30);
  const impactDensity = clamp01(densityPer100(impactHits, tc) / 0.15);

  // Quantified outcomes (metrics, percentages, dollar amounts)
  const quantifiedHits = (resumeLower.match(
    /(?:\$\s?\d[\d,.]*\s?[kmb]?|\b\d+(?:\.\d+)?\s?%|\b\d+[x×]|\b\d+\s?(?:customers|clients|teams|projects|accounts|locations|regions|departments|stakeholders|hours|days|weeks|months|years|members|reports|units|sites|markets))\b/gi
  ) || []).length;
  const quantDensity = clamp01(densityPer100(quantifiedHits, tc) / 0.20);

  // JD seniority alignment — does the resume use the same level language as the JD?
  const jdSeniorityHits = countPhraseHits(jdLower, SENIORITY_LANGUAGE);
  const jdHasSeniority = jdSeniorityHits > 2;
  const seniorityAlignment = jdHasSeniority
    ? clamp01(seniorityHits / Math.max(jdSeniorityHits * 0.6, 1))
    : 0.5; // neutral if JD doesn't emphasise seniority

  const raw =
    (seniorityDensity * 0.20) +
    (outcomeDensity * 0.20) +
    (impactDensity * 0.20) +
    (quantDensity * 0.25) +
    (seniorityAlignment * 0.15);

  const curved = Math.pow(clamp01(raw), 0.75);

  return Math.floor(clamp01(curved) * 100);
}

// ─── Sub-score 4: Readability (0–100) ────────────────────────────────────────

function scoreReadability(resumeText: string, resumeTokens: string[]): number {
  const tc = resumeTokens.length;
  if (tc === 0) return 0;

  // Bullet point density — well-structured resumes have bullets
  const bulletCount = (resumeText.match(/^[\s]*[•\-–—▪◦●]\s/gm) || []).length;
  const bulletScore = clamp01(bulletCount / 12); // ~12+ bullets is well structured

  // Sentence length — average words per line (shorter is more scannable)
  const lines = resumeText.split('\n').filter(l => l.trim().length > 10);
  const avgWordsPerLine = lines.length > 0
    ? lines.reduce((s, l) => s + tokenize(l).length, 0) / lines.length
    : 20;
  const brevityScore = clamp01(1 - (Math.max(avgWordsPerLine - 10, 0) / 25));

  // No giant walls of text
  const longLineCount = lines.filter(l => tokenize(l).length > 35).length;
  const wallPenalty = clamp01(longLineCount / 5) * 0.3;

  // Action-first sentences (start with verb)
  const actionStarts = lines.filter(l => {
    const first = tokenize(l.trim())[0];
    return first && (OWNERSHIP_STRONG.includes(first) || OWNERSHIP_PARTIAL.includes(first));
  }).length;
  const actionScore = clamp01(actionStarts / Math.max(lines.length * 0.4, 1));

  const raw = (bulletScore * 0.30) + (brevityScore * 0.30) + (actionScore * 0.25) - wallPenalty + 0.15;

  return Math.floor(clamp01(raw) * 100);
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

export function computeDeterministicScore(resumeText: string, jdText: string): DeterministicScoreResult {
  const normalized = normalizeText(resumeText);
  const sanitized = sanitizeInput(normalized);
  const resumeLower = sanitized.toLowerCase();
  const resumeTokens = tokenize(sanitized);
  const jdLower = jdText.toLowerCase();

  const jdVocab = buildJdVocab(jdText);

  // ── 4 deterministic sub-scores ──
  const jdMirroring = scoreJdMirroring(resumeLower, resumeTokens, jdVocab);
  const ownershipScope = scoreOwnershipScope(resumeLower, resumeTokens);
  const gapClosure = scoreGapClosure(resumeLower, resumeTokens, jdLower);
  const readability = scoreReadability(sanitized, resumeTokens);

  // ── Overall composite ──
  const finalScore = Math.floor(
    (jdMirroring * 0.40) +
    (ownershipScope * 0.30) +
    (gapClosure * 0.20) +
    (readability * 0.10)
  );

  // ── Map to existing 5-dimension breakdown for UI compatibility ──
  // These are derived from the 4 sub-scores to maintain backward compat
  const breakdown = {
    role_outcomes_alignment: Math.floor((ownershipScope * 0.50) + (gapClosure * 0.30) + (jdMirroring * 0.20)),
    tools_and_workflow_alignment: Math.floor((jdMirroring * 0.70) + (readability * 0.30)),
    domain_and_context_alignment: Math.floor((jdMirroring * 0.60) + (gapClosure * 0.40)),
    context_and_scale_alignment: Math.floor((gapClosure * 0.45) + (ownershipScope * 0.35) + (jdMirroring * 0.20)),
    communication_and_leadership_alignment: Math.floor((ownershipScope * 0.45) + (gapClosure * 0.30) + (jdMirroring * 0.25)),
  };

  return { finalScore, breakdown };
}
