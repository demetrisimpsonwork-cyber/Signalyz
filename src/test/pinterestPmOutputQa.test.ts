import { describe, it, expect } from "vitest";
import {
  repairBrokenDomainSpacing,
  splitSentencesSafe,
  validateCoverLetterIntegrity,
  stripMidBodyContactCta,
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
  parseSourceExperienceRoles,
} from "@/lib/calibratedResumeSanitizer";
import { normalizeResumeForExport } from "@/lib/resumeExportModel";
import { buildCalibratedDocxBlob } from "@/lib/exportDocx";
import { buildCalibratedPdfBlob } from "@/lib/exportPdf";
import {
  DEMETRI_PINTEREST_RESUME,
  DEMETRI_PINTEREST_RESUME_DOCX_SOURCE,
  PINTEREST_PM_APPRENTICE_JD,
  corruptedPinterestPmCalibratedResume,
  headerLayoutCorruptedPinterestPmCalibratedResume,
  locationBleedPinterestPmCalibratedResume,
  njdolDuplicateLocationCalibratedResume,
  PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG,
  PINTEREST_COVER_LETTER_WITH_MIDBODY_CTA,
  PINTEREST_COVER_LETTER_WITH_DANGLING_EMAIL_FRAGMENT,
  EXPECTED_PINTEREST_PM_ROLES,
} from "@/test/fixtures/outputQa/pinterestPmFixtures";

type ExperienceRow = {
  title: string;
  company: string;
  dates: string;
  location?: string;
  bullets: string[];
};

const sanitizeOpts = {
  jdText: PINTEREST_PM_APPRENTICE_JD,
  originalResumeText: DEMETRI_PINTEREST_RESUME,
};

const docxSanitizeOpts = {
  jdText: PINTEREST_PM_APPRENTICE_JD,
  originalResumeText: DEMETRI_PINTEREST_RESUME_DOCX_SOURCE,
};

function assertSourceRolesParsed(sourceText: string) {
  const roles = parseSourceExperienceRoles(sourceText);
  expect(roles).toHaveLength(4);

  const signalyz = roles.find((r) => /Signalyz/i.test(r.company))!;
  const njdol = roles.find((r) => /Department of Labor/i.test(r.company))!;
  const nthrive = roles.find((r) => /nThrive/i.test(r.company))!;
  const ast = roles.find((r) => /AST Fund Solutions/i.test(r.company))!;

  expect(signalyz.title).toMatch(/Founder/i);
  expect(signalyz.dates).toMatch(/2024/i);
  expect(signalyz.location).toMatch(/Phillipsburg,\s*NJ/i);

  expect(njdol.title).toMatch(/Claims Examiner/i);
  expect(njdol.dates).toMatch(/Jan\s+2023/i);
  expect(njdol.location).toMatch(/Trenton,\s*NJ/i);

  expect(nthrive.title).toMatch(/Revenue Cycle/i);
  expect(nthrive.dates).toMatch(/2021/i);
  expect(nthrive.location).toMatch(/^Remote$/i);

  expect(ast.title).toMatch(/Team Lead/i);
  expect(ast.dates).toMatch(/2016/i);
  expect(ast.location).toMatch(/^Remote$/i);
}

function assertPinterestExperienceStructure(experience: ExperienceRow[]) {
  expect(experience).toHaveLength(4);

  for (const expected of EXPECTED_PINTEREST_PM_ROLES) {
    const role = experience.find(
      (e) => expected.company.test(e.company) && expected.title.test(e.title),
    );
    expect(role, `missing role ${expected.company}`).toBeDefined();
    expect(role!.dates).toMatch(expected.dates);
    expect(role!.location || "").toMatch(expected.location);
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
  expect(signalyz.company).not.toMatch(/[—–]/);
  expect(njdol.company).not.toMatch(/Trenton/i);
  expect(nthrive.title).not.toMatch(/^remote$/i);

  for (const exp of experience) {
    expect(exp.company || exp.title).toBeTruthy();
    expect(exp.dates).toBeTruthy();
    expect(exp.location || "").toBeTruthy();
    expect(exp.company).not.toMatch(/^[—–]/);
    expect(isLocationOnlyHeader(exp.company, exp.title)).toBe(false);
    for (const bullet of exp.bullets) {
      expect(isMisplacedRoleHeaderBullet(bullet)).toBe(false);
      expect(isCompanyTitleHeaderBullet(bullet, DEMETRI_PINTEREST_RESUME)).toBe(false);
      expect(bullet).not.toMatch(/Asted Fund/i);
    }
  }
}

function isLocationOnlyHeader(company: string, title: string): boolean {
  const c = (company || "").trim();
  const t = (title || "").trim();
  if (/^remote$/i.test(c) || /^remote$/i.test(t)) return true;
  if (/^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}$/.test(c) && !t) return true;
  if (/^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}$/.test(t) && !c) return true;
  return false;
}

function assertCanonicalPinterestDates(experience: ExperienceRow[]) {
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

  it("strips mid-body contact CTA and flags it in integrity check", () => {
    const stripped = stripMidBodyContactCta(PINTEREST_COVER_LETTER_WITH_MIDBODY_CTA);
    expect(stripped).not.toMatch(/feel free to reach out at/i);
    expect(stripped).toContain("Signalyz.ai");
    expect(stripped.length).toBeGreaterThan(80);
    const { ok, issues } = validateCoverLetterIntegrity(PINTEREST_COVER_LETTER_WITH_MIDBODY_CTA);
    expect(ok).toBe(false);
    expect(issues.join(" ")).toMatch(/mid-body contact CTA/i);
  });

  it("keeps Pinterest PM cover letter body non-empty after CTA strip + integrity pass", () => {
    const body = stripMidBodyContactCta(PINTEREST_COVER_LETTER_WITH_MIDBODY_CTA);
    const { ok, issues } = validateCoverLetterIntegrity(body);
    expect(body).toMatch(/Signalyz\.ai/i);
    expect(body).not.toMatch(/feel free to reach out at/i);
    expect(body).not.toMatch(/Signalyz\.\s+ai/i);
    expect(body).not.toMatch(/product manager credentials/i);
    expect(ok).toBe(true);
    expect(issues).toEqual([]);
  });

  it("strips dangling email fragment from apprenticeship CTA sentence", () => {
    const stripped = stripMidBodyContactCta(PINTEREST_COVER_LETTER_WITH_DANGLING_EMAIL_FRAGMENT);
    expect(stripped).not.toMatch(/Simpson\.work@gmail\.com/i);
    expect(stripped).not.toMatch(/right fit\./i);
    expect(stripped).toMatch(/Signalyz\.ai/i);
    expect(stripped.length).toBeGreaterThan(80);
    const { ok, issues } = validateCoverLetterIntegrity(stripped);
    expect(ok).toBe(true);
    expect(issues).toEqual([]);
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

describe("Pinterest PM output QA — source-truth parsing", () => {
  it("parses pipe-format uploaded source into exactly four roles", () => {
    assertSourceRolesParsed(DEMETRI_PINTEREST_RESUME);
  });

  it("parses DOCX block-layout uploaded source into exactly four roles", () => {
    assertSourceRolesParsed(DEMETRI_PINTEREST_RESUME_DOCX_SOURCE);
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
        location: e.location,
        bullets: e.bullets,
      })),
    );
    assertCanonicalPinterestDates(
      cleaned.experience.map((e) => ({
        title: e.title,
        company: e.company,
        dates: e.dates,
        location: e.location,
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

  it("repairs header-layout corruption into four canonical roles", () => {
    const corrupted = headerLayoutCorruptedPinterestPmCalibratedResume();
    const model = normalizeResumeForExport(corrupted, sanitizeOpts);

    assertPinterestExperienceStructure(model.experience);
    assertCanonicalPinterestDates(model.experience);
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

  it("locks source locations and prevents cross-role location bleed", () => {
    const corrupted = locationBleedPinterestPmCalibratedResume();
    const { resume: cleaned } = sanitizeCalibratedResume(corrupted, sanitizeOpts);
    const model = normalizeResumeForExport(corrupted, sanitizeOpts);

    assertPinterestExperienceStructure(
      cleaned.experience.map((e) => ({
        title: e.title,
        company: e.company,
        dates: e.dates,
        location: e.location,
        bullets: e.bullets,
      })),
    );
    assertPinterestExperienceStructure(model.experience);

    const signalyz = cleaned.experience.find((e) => /Signalyz/i.test(e.company))!;
    const njdol = cleaned.experience.find((e) => /Department of Labor/i.test(e.company))!;
    expect(signalyz.location).toMatch(/Phillipsburg,\s*NJ/i);
    expect(njdol.location).toMatch(/Trenton,\s*NJ/i);
    expect(signalyz.location).not.toMatch(/Trenton/i);
    expect(njdol.location).not.toMatch(/Phillipsburg/i);
  });

  it("rehydrates NJDOL from DOCX source when output has duplicate Trenton location headers", () => {
    const corrupted = njdolDuplicateLocationCalibratedResume();
    const model = normalizeResumeForExport(corrupted, docxSanitizeOpts);

    assertPinterestExperienceStructure(model.experience);
    assertCanonicalPinterestDates(model.experience);

    const njdol = model.experience.find((e) => /Department of Labor/i.test(e.company))!;
    expect(njdol.title).toMatch(/Claims Examiner/i);
    expect(njdol.company).not.toMatch(/Trenton/i);
    expect(njdol.location).toMatch(/Trenton,\s*NJ/i);
    expect(isLocationOnlyHeader(njdol.company, njdol.title)).toBe(false);

    const signalyz = model.experience.find((e) => /Signalyz/i.test(e.company))!;
    expect(signalyz.location).toMatch(/Phillipsburg,\s*NJ/i);
    expect(signalyz.location).not.toMatch(/Trenton/i);
  });

  it("rehydrates all four roles from DOCX source for header-layout corruption", () => {
    const corrupted = headerLayoutCorruptedPinterestPmCalibratedResume();
    const model = normalizeResumeForExport(corrupted, docxSanitizeOpts);

    assertPinterestExperienceStructure(model.experience);
    assertCanonicalPinterestDates(model.experience);
  });
});
