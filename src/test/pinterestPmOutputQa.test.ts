import { describe, it, expect } from "vitest";
import {
  repairBrokenDomainSpacing,
  splitSentencesSafe,
  validateCoverLetterIntegrity,
} from "../../supabase/functions/_shared/coverLetterIntegrity";
import {
  detectRoleCategory,
  roleStyleGuidance,
  apprenticeshipRoleStructureBlock,
} from "../../supabase/functions/_shared/coverLetterRoleStyle";
import {
  sanitizeCalibratedResume,
  validateCalibratedResumeIntegrity,
  isMisplacedRoleHeaderBullet,
} from "@/lib/calibratedResumeSanitizer";
import { normalizeResumeForExport } from "@/lib/resumeExportModel";
import {
  DEMETRI_PINTEREST_RESUME,
  PINTEREST_PM_APPRENTICE_JD,
  malformedPinterestCalibratedResume,
  PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG,
} from "@/test/fixtures/outputQa/pinterestPmFixtures";

describe("Pinterest PM output QA — domain spacing", () => {
  it("does not split Signalyz.ai during sentence segmentation", () => {
    const sentences = splitSentencesSafe(
      "I built Signalyz.ai from concept to production. The product makes hiring signal readable.",
    );
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("Signalyz.ai");
    expect(sentences[0]).not.toMatch(/Signalyz\.\s+ai/i);
  });

  it("repairs broken Signalyz. ai spacing", () => {
    const fixed = repairBrokenDomainSpacing("I shipped Signalyz. ai with evaluation guardrails.");
    expect(fixed).toContain("Signalyz.ai");
    expect(fixed).not.toMatch(/Signalyz\.\s+ai/i);
  });

  it("validates clean Pinterest-style letter with intact domain", () => {
    const { ok, issues } = validateCoverLetterIntegrity(PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG);
    expect(issues).toEqual([]);
    expect(ok).toBe(true);
  });

  it("flags broken domain spacing in integrity check", () => {
    const broken = PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG.replace("Signalyz.ai", "Signalyz. ai");
    const { ok, issues } = validateCoverLetterIntegrity(broken);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/broken domain spacing/i);
  });
});

describe("Pinterest PM output QA — role category", () => {
  it("classifies Pinterest PM apprenticeship separately from Staff AI engineer", () => {
    expect(detectRoleCategory(PINTEREST_PM_APPRENTICE_JD, "Product Manager Apprentice")).toBe(
      "product_apprenticeship",
    );
    expect(roleStyleGuidance("product_apprenticeship")).toMatch(/apprenticeship/i);
    expect(apprenticeshipRoleStructureBlock()).toMatch(/WARM OPENING/i);
  });
});

describe("Pinterest PM output QA — resume structure repair", () => {
  it("detects misplaced role header bullets", () => {
    expect(isMisplacedRoleHeaderBullet("Founder / Product Builder | Signalyz | 2022 – Present")).toBe(
      true,
    );
    expect(isMisplacedRoleHeaderBullet("Built Signalyz.ai from concept to production.")).toBe(false);
  });

  it("promotes collapsed role headers and preserves NJDOL, nThrive, AST Fund Solutions", () => {
    const malformed = malformedPinterestCalibratedResume();
    const { resume: cleaned } = sanitizeCalibratedResume(malformed, {
      jdText: PINTEREST_PM_APPRENTICE_JD,
      originalResumeText: DEMETRI_PINTEREST_RESUME,
    });

    const companies = cleaned.experience.map((e) => e.company).join(" | ");
    expect(companies).toMatch(/Signalyz/i);
    expect(companies).toMatch(/New Jersey Department of Labor|NJDOL/i);
    expect(companies).toMatch(/nThrive/i);
    expect(companies).toMatch(/AST Fund Solutions/i);

    expect(cleaned.experience.find((e) => /Signalyz/i.test(e.company))?.dates).toMatch(/2022/);
    expect(cleaned.experience.find((e) => /NJDOL|Department of Labor/i.test(e.company))?.dates).toMatch(
      /2017/,
    );

    for (const exp of cleaned.experience) {
      for (const bullet of exp.bullets) {
        expect(isMisplacedRoleHeaderBullet(bullet)).toBe(false);
        expect(bullet).not.toMatch(/^\s*2017\s*[-–—]/);
      }
    }

    const issues = validateCalibratedResumeIntegrity(cleaned);
    expect(issues.filter((i) => /misplaced role header|company-only|detached dates/i.test(i))).toEqual(
      [],
    );
  });

  it("normalizeResumeForExport keeps structured experience for preview/DOCX path", () => {
    const malformed = malformedPinterestCalibratedResume();
    const model = normalizeResumeForExport(malformed, {
      jdText: PINTEREST_PM_APPRENTICE_JD,
      originalResumeText: DEMETRI_PINTEREST_RESUME,
    });

    expect(model.experience.length).toBeGreaterThanOrEqual(3);
    expect(model.summary).toMatch(/Signalyz\.ai/i);
    expect(model.experience.every((e) => e.company || e.title)).toBe(true);
    expect(model.experience.some((e) => /AST Fund Solutions/i.test(e.company))).toBe(true);
  });
});
