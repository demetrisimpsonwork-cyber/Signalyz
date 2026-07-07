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
  isCompanyTitleHeaderBullet,
} from "@/lib/calibratedResumeSanitizer";
import { normalizeResumeForExport } from "@/lib/resumeExportModel";
import { buildCalibratedDocxBlob } from "@/lib/exportDocx";
import { buildCalibratedPdfBlob } from "@/lib/exportPdf";
import {
  DEMETRI_PINTEREST_RESUME,
  PINTEREST_PM_APPRENTICE_JD,
  corruptedPinterestPmCalibratedResume,
  PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG,
  EXPECTED_PINTEREST_PM_ROLES,
} from "@/test/fixtures/outputQa/pinterestPmFixtures";

const sanitizeOpts = {
  jdText: PINTEREST_PM_APPRENTICE_JD,
  originalResumeText: DEMETRI_PINTEREST_RESUME,
};

function assertPinterestExperienceStructure(
  experience: ReturnType<typeof normalizeResumeForExport>["experience"],
) {
  expect(experience).toHaveLength(4);

  for (const expected of EXPECTED_PINTEREST_PM_ROLES) {
    const role = experience.find(
      (e) => expected.company.test(e.company) && expected.title.test(e.title),
    );
    expect(role, `missing role ${expected.company}`).toBeDefined();
    expect(role!.dates).toMatch(expected.dates);
    expect(role!.bullets.length).toBeGreaterThanOrEqual(1);
    expect(role!.bullets.join(" ")).toMatch(expected.bulletHint);
  }

  const signalyz = experience.find((e) => /Signalyz/i.test(e.company))!;
  const njdol = experience.find((e) => /Department of Labor/i.test(e.company))!;
  const nthrive = experience.find((e) => /nThrive/i.test(e.company))!;
  const ast = experience.find((e) => /AST Fund Solutions/i.test(e.company))!;

  expect(signalyz.bullets.join(" ")).not.toMatch(/Family Leave Insurance/i);
  expect(njdol.bullets.join(" ")).not.toMatch(/Signalyz\.ai/i);
  expect(nthrive.bullets.join(" ")).not.toMatch(/proxy voting/i);
  expect(ast.bullets.join(" ")).not.toMatch(/revenue cycle workflows/i);
  expect(ast.company).toBe("AST Fund Solutions");
  expect(ast.company).not.toMatch(/Asted/i);

  for (const exp of experience) {
    expect(exp.company || exp.title).toBeTruthy();
    expect(exp.dates).toBeTruthy();
    for (const bullet of exp.bullets) {
      expect(isMisplacedRoleHeaderBullet(bullet)).toBe(false);
      expect(isCompanyTitleHeaderBullet(bullet, DEMETRI_PINTEREST_RESUME)).toBe(false);
      expect(bullet).not.toMatch(/Asted Fund/i);
    }
  }
}

function assertCanonicalPinterestDates(
  experience: ReturnType<typeof normalizeResumeForExport>["experience"],
) {
  const signalyz = experience.find((e) => /Signalyz/i.test(e.company))!;
  const njdol = experience.find((e) => /Department of Labor/i.test(e.company))!;
  const nthrive = experience.find((e) => /nThrive/i.test(e.company))!;
  const ast = experience.find((e) => /AST Fund Solutions/i.test(e.company))!;

  expect(signalyz.dates).toMatch(/2024/i);
  expect(signalyz.dates).toMatch(/Present/i);
  expect(signalyz.dates).not.toMatch(/2022/i);

  expect(njdol.dates).toMatch(/Jan\s+2023/i);
  expect(njdol.dates).toMatch(/Jun\s+2024/i);
  expect(njdol.dates).not.toMatch(/2017/i);

  expect(nthrive.dates).toMatch(/2021/i);
  expect(nthrive.dates).toMatch(/2023/i);

  expect(ast.dates).toMatch(/2016/i);
  expect(ast.dates).toMatch(/2020/i);
}

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
  it("detects company/title header bullets for promotion", () => {
    expect(isCompanyTitleHeaderBullet("AST Fund Solutions — Team Lead, Proxy Voting Specialist", DEMETRI_PINTEREST_RESUME)).toBe(true);
    expect(isCompanyTitleHeaderBullet("Asted Fund Solutions — Team Lead, Proxy Voting Specialist", DEMETRI_PINTEREST_RESUME)).toBe(true);
    expect(isCompanyTitleHeaderBullet("New Jersey Department of Labor — Claims Examiner", DEMETRI_PINTEREST_RESUME)).toBe(true);
    expect(isCompanyTitleHeaderBullet("Built Signalyz.ai from concept to production.", DEMETRI_PINTEREST_RESUME)).toBe(false);
  });

  it("repairs corrupted Pinterest PM experience into four structured roles", () => {
    const corrupted = corruptedPinterestPmCalibratedResume();
    const { resume: cleaned } = sanitizeCalibratedResume(corrupted, sanitizeOpts);

    assertPinterestExperienceStructure(
      cleaned.experience.map((e) => ({
        title: e.title,
        company: e.company,
        dates: e.dates,
        bullets: e.bullets,
      })),
    );
    assertCanonicalPinterestDates(
      cleaned.experience.map((e) => ({
        title: e.title,
        company: e.company,
        dates: e.dates,
        bullets: e.bullets,
      })),
    );

    const issues = validateCalibratedResumeIntegrity(cleaned);
    expect(
      issues.filter((i) =>
        /misplaced role header|company-only|company\/title header|detached dates/i.test(i),
      ),
    ).toEqual([]);
  });

  it("normalizeResumeForExport keeps structured experience for preview/DOCX/PDF path", () => {
    const corrupted = corruptedPinterestPmCalibratedResume();
    const model = normalizeResumeForExport(corrupted, sanitizeOpts);

    assertPinterestExperienceStructure(model.experience);
    assertCanonicalPinterestDates(model.experience);
    expect(model.summary).toMatch(/Signalyz\.ai/i);
  });

  it("DOCX and PDF export use the same sanitized four-role structure", async () => {
    const corrupted = corruptedPinterestPmCalibratedResume();
    const docx = await buildCalibratedDocxBlob(corrupted, sanitizeOpts);
    const pdf = await buildCalibratedPdfBlob(corrupted, sanitizeOpts);

    assertPinterestExperienceStructure(docx.model.experience);
    assertPinterestExperienceStructure(pdf.model.experience);
    assertCanonicalPinterestDates(docx.model.experience);
    assertCanonicalPinterestDates(pdf.model.experience);
    expect(docx.blob.size).toBeGreaterThan(500);
    expect(pdf.blob.size).toBeGreaterThan(500);
  });

  it("prefers exact company/title source dates over overlapping year-only matches", () => {
    const corrupted = corruptedPinterestPmCalibratedResume();
    const { resume: cleaned } = sanitizeCalibratedResume(corrupted, sanitizeOpts);

    const signalyz = cleaned.experience.find((e) => /Signalyz/i.test(e.company))!;
    const njdol = cleaned.experience.find((e) => /Department of Labor/i.test(e.company))!;
    const nthrive = cleaned.experience.find((e) => /nThrive/i.test(e.company))!;

    expect(signalyz.dates).toMatch(/2024/i);
    expect(njdol.dates).toMatch(/Jan\s+2023/i);
    expect(nthrive.dates).toMatch(/2021/i);
    expect(njdol.dates).not.toMatch(/2017|2021/i);
    expect(nthrive.dates).not.toMatch(/2017/i);
  });
});
