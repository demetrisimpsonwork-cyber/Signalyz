/**
 * Deterministic JD compaction for Hiring Report (director-calibration) only.
 * Strips low-signal legal/benefits boilerplate while preserving hiring requirements.
 */

export interface JdCompactionResult {
  compacted: string;
  originalLength: number;
  compactedLength: number;
  removedBlockCount: number;
}

/** Section titles that are safe to drop entirely. */
const DROP_SECTION_TITLE_RX = [
  /\bbenefits?\b/i,
  /\b(?:what we offer|perks|compensation package|total rewards)\b/i,
  /\bcompensation\b/i,
  /\bsalary\b/i,
  /\bpay range\b/i,
  /\bequal opportunity\b/i,
  /\beeo\b/i,
  /\baffirmative action\b/i,
  /\baccommodation\b/i,
  /\bdisability\b/i,
  /\bveterans?\b/i,
  /\bbackground check\b/i,
  /\bdrug (?:test|screen)/i,
  /\bfair chance\b/i,
  /\bban the box\b/i,
  /\blegal disclaimer\b/i,
  /\bprivacy (?:policy|notice)\b/i,
  /\bgdpr\b/i,
  /\b401\s*\(\s*k\s*\)/i,
  /\bhealth (?:insurance|care|benefits)\b/i,
  /\bdental\b/i,
  /\bvision insurance\b/i,
  /\bpaid time off\b/i,
  /\b(?:^|\b)pto\b/i,
  /\bholiday pay\b/i,
  /\blife insurance\b/i,
  /\bemployee stock\b/i,
  /\bwork[- ]life balance\b/i,
  /\bculture of belonging\b/i,
];

/** High-value sections — never drop based on title alone. */
const KEEP_SECTION_TITLE_RX = [
  /\b(?:responsibilit|what you(?:'|')ll do|duties|the role|job summary|position summary|role overview)\b/i,
  /\b(?:required|minimum|must[- ]have|qualifications|requirements|skills needed|technical requirements)\b/i,
  /\b(?:preferred|nice to have|bonus|desired)\b/i,
  /\b(?:about us|who we are|company overview|our company)\b/i,
  /\b(?:screening|interview|application process)\b/i,
  /\b(?:tools|technologies|tech stack)\b/i,
  /\b(?:years of experience|education|degree|certification)\b/i,
];

/** Paragraph-level boilerplate to remove from mixed blocks. */
const DROP_PARAGRAPH_RX = [
  /^equal opportunity employer/im,
  /^.{0,40}is an equal opportunity/im,
  /reasonable accommodation/im,
  /accommodation.*disabilit/im,
  /background check.*required/im,
  /drug screen/im,
  /salary range.*california/im,
  /pursuant to.*ordinance/im,
  /will not discriminate/im,
  /minorit(y|ies).*(?:women|veteran|disabled|lgbtq)/im,
  /\bemployer of choice\b/im,
  /\bcompetitive salary\b/im,
  /\bcomprehensive benefits\b/im,
  /\b401\s*\(\s*k\s*\)\s*(?:match|matching)/im,
  /\bmedical,?\s*dental,?\s*(?:and\s*)?vision\b/im,
  /\bpaid holidays?\b/im,
  /\bunlimited pto\b/im,
  /\bfair chance hiring\b/im,
  /\bcriminal history\b/im,
];

const REQUIREMENT_SIGNAL_RX =
  /\b(responsibilit|qualification|requirement|must|shall|experience|degree|certification|programming|scripting|sdlc|unit test|integration test|restful|api|genai|cloud ai|n-tier|database|container|software engineer|develop|implement|support|testing|architecture)\b/i;

function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function firstLine(block: string): string {
  return block.split("\n")[0]?.trim() ?? "";
}

function isRoleTitleBlock(block: string, index: number): boolean {
  if (index !== 0) return false;
  const line = firstLine(block);
  if (!line || line.length > 120) return false;
  if (DROP_SECTION_TITLE_RX.some((rx) => rx.test(line))) return false;
  return !DROP_PARAGRAPH_RX.some((rx) => rx.test(block));
}

function shouldDropSection(titleLine: string, block: string): boolean {
  if (KEEP_SECTION_TITLE_RX.some((rx) => rx.test(titleLine))) return false;
  if (DROP_SECTION_TITLE_RX.some((rx) => rx.test(titleLine))) return true;
  if (DROP_PARAGRAPH_RX.some((rx) => rx.test(block))) {
    // Keep if the block still carries clear hiring requirements beyond boilerplate.
    return !REQUIREMENT_SIGNAL_RX.test(block);
  }
  return false;
}

function filterParagraphsInBlock(block: string): string {
  const paragraphs = block.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kept = paragraphs.filter((paragraph) => {
    if (DROP_PARAGRAPH_RX.some((rx) => rx.test(paragraph))) {
      return REQUIREMENT_SIGNAL_RX.test(paragraph);
    }
    return true;
  });
  return kept.join("\n\n").trim();
}

/**
 * Compact a job description for the Hiring Report pipeline.
 * Deterministic — same input always yields the same output.
 */
export function compactJdForHiringReport(jd: string): JdCompactionResult {
  const original = jd.trim();
  if (!original) {
    return {
      compacted: "",
      originalLength: 0,
      compactedLength: 0,
      removedBlockCount: 0,
    };
  }

  const blocks = original.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const seen = new Set<string>();
  const kept: string[] = [];
  let removedBlockCount = 0;

  blocks.forEach((block, index) => {
    const titleLine = firstLine(block);

    if (isRoleTitleBlock(block, index)) {
      const key = normalizeForDedupe(block);
      if (!seen.has(key)) {
        seen.add(key);
        kept.push(block);
      } else {
        removedBlockCount += 1;
      }
      return;
    }

    if (shouldDropSection(titleLine, block)) {
      removedBlockCount += 1;
      return;
    }

    const filtered = filterParagraphsInBlock(block);
    if (!filtered) {
      removedBlockCount += 1;
      return;
    }

    const key = normalizeForDedupe(filtered);
    if (seen.has(key)) {
      removedBlockCount += 1;
      return;
    }

    seen.add(key);
    kept.push(filtered);
  });

  const compacted = kept.join("\n\n").trim();
  return {
    compacted,
    originalLength: original.length,
    compactedLength: compacted.length,
    removedBlockCount,
  };
}

/** Robert Half Software Engineer I fixture for compaction tests. */
export const ROBERT_HALF_SWE_JD_FIXTURE = `
Software Engineer I

Who We Are
At Robert Half, we're driven by innovation and committed to connecting employers with skilled professionals.

Full Job Description

What You'll Do
- Respond to production issues and provide Level I development support for assigned modules and components.
- Modify and/or enhance existing components with guidance from a supervisor or senior engineer.
- Develop unit tests and integration tests for new and existing code paths.
- Support GenAI-related tasks and integrate cloud AI services into application workflows.
- Design and consume RESTful APIs across n-tier application architecture.

Required Qualifications
- Proficiency in programming and scripting languages relevant to the stack.
- Experience writing and modifying programs under SDLC discipline.
- Application administration and configuration experience.
- Working knowledge of n-tier architecture and database concepts.
- Familiarity with containers and deployment tooling.
- Understanding of AI ethics principles for responsible GenAI use.
- Ability to develop requirements and test plans with cross-functional partners.

Preferred Qualifications
- Prior internship or academic projects in software engineering.
- Exposure to cloud platforms and CI/CD pipelines.

Benefits Package
We offer comprehensive health, dental, and vision insurance, 401(k) matching, paid holidays, unlimited PTO, and employee stock purchase plans.

Compensation
Salary range varies by location. California applicants may receive additional pay transparency disclosures.

Equal Opportunity Employer
Robert Half is an Equal Opportunity Employer. We provide reasonable accommodation for applicants with disabilities. We do not discriminate based on race, color, religion, sex, national origin, age, disability, veteran status, or other protected classes.

Background Check
Employment is contingent upon successful completion of a background check and drug screen where permitted by law.

Fair Chance Ordinance
Pursuant to applicable fair chance ordinances, we consider qualified applicants with criminal histories consistent with local law.
`.trim();
