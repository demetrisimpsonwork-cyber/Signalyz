import type { DetectorContext, QaIssue, ResumeSection } from "./types.ts";
import { parseResumeSections } from "./types.ts";

const AI_PRODUCT_TERMS = [
  "model outputs",
  "llm",
  "rag",
  "embeddings",
  "fine-tuning",
  "fine tuning",
  "prompt engineering",
  "vector database",
  "inference",
  "neural network",
  "transformer",
  "tokenization",
  "hallucination",
  "agentic",
  "langchain",
  "openai",
  "anthropic",
] as const;

const NON_TECH_EMPLOYER_MARKERS = [
  "department of labor",
  "njdol",
  "new jersey department of labor",
  "customer service representative",
  "call center",
  "benefits services",
] as const;

/** Prevent AI/product language from being injected into unrelated prior roles. */
export function detectRoleContamination(ctx: DetectorContext): QaIssue[] {
  const issues: QaIssue[] = [];
  const sourceSections = parseResumeSections(ctx.sourceResumeText);
  const generatedSections = parseResumeSections(ctx.generatedResumeText);

  for (const genSection of generatedSections) {
    if (!isNonTechnicalEmployerSection(genSection)) continue;

    const sourceSection = findMatchingSourceSection(genSection, sourceSections);
    const sourceBody = (sourceSection?.body ?? "").toLowerCase();
    const jdAllowsAi = AI_PRODUCT_TERMS.some((t) => ctx.jdCorpus.includes(t));

    for (const term of AI_PRODUCT_TERMS) {
      if (!genSection.body.toLowerCase().includes(term)) continue;
      if (sourceBody.includes(term)) continue;
      if (jdAllowsAi && genSection.company?.toLowerCase().includes("signalyz")) continue;

      issues.push({
        code: "role_contamination",
        severity: "critical",
        message: `Role contamination: "${term}" appears under ${genSection.company ?? genSection.heading} but not in the source resume for that role.`,
        evidence: genSection.body.split("\n").find((l) => l.toLowerCase().includes(term)) ?? genSection.body,
        section: genSection.company ?? genSection.heading,
        suggestedFix: `Remove AI/product language from ${genSection.company ?? "non-technical role"} unless source resume supports it.`,
      });
    }
  }

  return dedupeIssues(issues);
}

function isNonTechnicalEmployerSection(section: ResumeSection): boolean {
  const hay = `${section.heading} ${section.company ?? ""} ${section.body}`.toLowerCase();
  return NON_TECH_EMPLOYER_MARKERS.some((m) => hay.includes(m));
}

function findMatchingSourceSection(
  generated: ResumeSection,
  sourceSections: ResumeSection[],
): ResumeSection | undefined {
  const company = (generated.company ?? generated.heading).toLowerCase();
  return sourceSections.find((s) => {
    const srcCompany = (s.company ?? s.heading).toLowerCase();
    return srcCompany.includes(company) || company.includes(srcCompany);
  });
}

function dedupeIssues(issues: QaIssue[]): QaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.section}:${i.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
