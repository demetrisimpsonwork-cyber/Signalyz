import { normalizeCorpus } from "./types.ts";

/** Equivalence groups — any member matching corpus counts as present. */
export const SYNONYM_GROUPS: string[][] = [
  ["rest api", "restful api", "restful", "rest apis", "restful apis"],
  ["llm", "large language model", "large language models"],
  ["oauth", "google oauth", "oauth2", "oauth 2.0"],
  ["cloud", "aws", "azure", "gcp", "cloud deployment", "cloud infrastructure"],
  ["ci/cd", "cicd", "continuous integration", "continuous deployment"],
  ["node.js", "nodejs", "node js"],
  ["typescript", "ts"],
  ["javascript", "js"],
  ["postgresql", "postgres"],
  ["machine learning", "ml"],
  ["full stack", "fullstack", "full-stack"],
  ["customer success", "customer service"],
  ["production ai", "ai platform", "ai-powered"],
];

const GROUP_LOOKUP = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const key = group[0];
  for (const term of group) {
    GROUP_LOOKUP.set(normalizeCorpus(term), key);
  }
}

/** Common engineering / resume phrases explainable by transferable rewrite. */
export const TRANSFERABLE_TECH_PHRASES = new Set([
  "rest api",
  "rest apis",
  "restful api",
  "api integration",
  "api integrations",
  "cross functional",
  "stakeholder",
  "production",
  "deployment",
  "monitoring",
  "authentication",
  "integration",
  "full stack",
  "software engineer",
  "machine learning",
  "data pipeline",
  "customer service",
  "professional summary",
  "core competencies",
]);

/** High-confidence cross-JD contamination signatures. */
export const KNOWN_CONTAMINATION_PHRASES = new Set([
  "ai sandbox",
]);

export function normalizePhrase(phrase: string): string {
  return normalizeCorpus(phrase);
}

export function expandPhraseVariants(phrase: string): string[] {
  const norm = normalizePhrase(phrase);
  const variants = new Set<string>([norm]);
  const groupKey = GROUP_LOOKUP.get(norm);
  if (groupKey) {
    const group = SYNONYM_GROUPS.find((g) => g[0] === groupKey);
    if (group) {
      for (const term of group) variants.add(normalizePhrase(term));
    }
  }
  return [...variants];
}

export function phraseMatchesCorpus(phrase: string, corpus: string): boolean {
  const variants = expandPhraseVariants(phrase);
  return variants.some((v) => corpus.includes(v));
}

export function isTransferableRewrite(phrase: string): boolean {
  const norm = normalizePhrase(phrase);
  if (TRANSFERABLE_TECH_PHRASES.has(norm)) return true;
  const groupKey = GROUP_LOOKUP.get(norm);
  if (groupKey && TRANSFERABLE_TECH_PHRASES.has(groupKey)) return true;
  return false;
}

export function isKnownContamination(phrase: string): boolean {
  const norm = normalizePhrase(phrase);
  if (KNOWN_CONTAMINATION_PHRASES.has(norm)) return true;
  return [...KNOWN_CONTAMINATION_PHRASES].some((bad) => norm.includes(bad));
}

export function explainPhrasePresence(
  phrase: string,
  sourceCorpus: string,
  jdCorpus: string,
): {
  inSource: boolean;
  inJd: boolean;
  transferable: boolean;
  synonymMatched: boolean;
} {
  const inSource = phraseMatchesCorpus(phrase, sourceCorpus);
  const inJd = phraseMatchesCorpus(phrase, jdCorpus);
  const transferable = isTransferableRewrite(phrase);
  const variants = expandPhraseVariants(phrase);
  const synonymMatched =
    variants.length > 1 &&
    (variants.some((v) => sourceCorpus.includes(v)) || variants.some((v) => jdCorpus.includes(v)));
  return { inSource, inJd, transferable, synonymMatched };
}
