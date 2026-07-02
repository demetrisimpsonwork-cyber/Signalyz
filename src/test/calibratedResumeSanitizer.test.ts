import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import {
  sanitizeCalibratedResume,
  scrubTargetArtifactsFromText,
  repairUnmatchedCloseParen,
  isOrphanFragment,
  isCompanyLocationOnlyBullet,
  repairEmployerTypo,
  maybeNormalizeProjectName,
  validateCalibratedResumeIntegrity,
  isWhyCompanyHeading,
} from "@/lib/calibratedResumeSanitizer";
import { normalizeResumeForExport } from "@/lib/resumeExportModel";

const CARMAX_JD =
  "Customer Specialist in Training at CarMax. CarMax is the nation's largest retailer of used cars.";

const JUSTWORKS_JD =
  "Join Justworks as a Customer Support Advocate. Justworks provides HR platform support.";

function baseResume(overrides: Partial<CalibratedResumeData> = {}): CalibratedResumeData {
  return {
    header: {
      name: "Demetri Simpson",
      title: "Customer Service Specialist",
      email: "demetri@example.com",
      phone: "",
      linkedin: "",
      location: "Newark, NJ",
    },
    summary: "Phone support specialist with escalation experience.",
    core_competencies: ["Escalation handling", "Documentation accuracy"],
    experience: [
      {
        title: "Customer Service Representative",
        company: "NJDOL",
        dates: "2019 – 2023",
        bullets: ["Managed high-volume casework with strict SLA requirements."],
      },
    ],
    independent_projects: [],
    skills: [],
    certifications: [],
    education: [],
    signal_keywords: [],
    ...overrides,
  };
}

const ORIGINAL_WITH_AST = `
Experience
Customer Service Representative | NJDOL | 2019 – 2023
- Managed casework.

Operations Specialist | AST Fund Solutions | 2021 – 2022 | Remote
- Supported fund operations.
`.trim();

describe("calibratedResumeSanitizer — target artifact scrub (Phase 10.0)", () => {
  it("removes WHY JUSTWORKS when current JD targets CarMax", () => {
    const resume = baseResume({
      summary: [
        "Operations professional with support experience.",
        "WHY JUSTWORKS",
        "The Justworks support model depends on accurate routing and fast resolution.",
      ].join("\n\n"),
    });

    const { resume: cleaned, removed } = sanitizeCalibratedResume(resume, { jdText: CARMAX_JD });
    expect(cleaned.summary).not.toMatch(/WHY\s+JUSTWORKS/i);
    expect(cleaned.summary).not.toMatch(/Justworks support model/i);
    expect(removed.some((r) => /WHY JUSTWORKS/i.test(r))).toBe(true);
  });

  it("keeps WHY JUSTWORKS when current JD targets Justworks", () => {
    const resume = baseResume({
      summary: [
        "Support specialist with HR platform experience.",
        "WHY JUSTWORKS",
        "The Justworks support model depends on accurate routing.",
      ].join("\n\n"),
    });

    const { resume: cleaned } = sanitizeCalibratedResume(resume, { jdText: JUSTWORKS_JD });
    expect(cleaned.summary).toMatch(/WHY\s+JUSTWORKS/i);
    expect(cleaned.summary).toMatch(/Justworks support model/i);
  });

  it("removes stale target-company positioning paragraphs on company mismatch", () => {
    const { text, removed } = scrubTargetArtifactsFromText(
      "The Justworks support model depends on fast issue resolution.",
      "CarMax",
    );
    expect(text).toBe("");
    expect(removed.length).toBeGreaterThan(0);
  });

  it("detects WHY company headings", () => {
    expect(isWhyCompanyHeading("WHY JUSTWORKS")).toBe(true);
    expect(isWhyCompanyHeading("WHY CARMAX")).toBe(true);
  });
});

describe("calibratedResumeSanitizer — integrity guard (Phase 10.0)", () => {
  it('repairs "Email, Chat), Payroll" orphan close-paren', () => {
    expect(repairUnmatchedCloseParen("Email, Chat), Payroll")).toBe("Email, Chat, Payroll");
  });

  it('removes orphan fragment "kind o."', () => {
    expect(isOrphanFragment("kind o.")).toBe(true);
    const resume = baseResume({
      core_competencies: ["Escalation handling", "kind o."],
    });
    const { resume: cleaned } = sanitizeCalibratedResume(resume, { jdText: CARMAX_JD });
    expect(cleaned.core_competencies).not.toContain("kind o.");
  });

  it("re-homes AST Fund Solutions from a company-only bullet under another role", () => {
    const resume = baseResume({
      experience: [
        {
          title: "Customer Service Representative",
          company: "NJDOL",
          dates: "2019 – 2023",
          bullets: [
            "Managed high-volume casework.",
            "Asted Fund Solutions — Remote.",
          ],
        },
      ],
    });

    const { resume: cleaned, repaired } = sanitizeCalibratedResume(resume, {
      jdText: CARMAX_JD,
      originalResumeText: ORIGINAL_WITH_AST,
    });

    expect(cleaned.experience[0].bullets).not.toContain("Asted Fund Solutions — Remote.");
    expect(cleaned.experience.some((e) => /AST Fund Solutions/i.test(e.company))).toBe(true);
    expect(repaired.some((r) => /re-homed employer/i.test(r))).toBe(true);
  });

  it("repairs Asted → AST when source resume supports AST Fund Solutions", () => {
    expect(repairEmployerTypo("Asted Fund Solutions", ORIGINAL_WITH_AST)).toBe("AST Fund Solutions");
  });

  it("rejects company/location-only bullets", () => {
    expect(isCompanyLocationOnlyBullet("AST Fund Solutions — Remote.")).toBe(true);
    expect(
      isCompanyLocationOnlyBullet("Managed fund operations and reconciled daily reporting."),
    ).toBe(false);
  });

  it("does not rewrite Resumix to Signalyz without source support", () => {
    expect(maybeNormalizeProjectName("Resumix", "Built Resumix resume tool.")).toBe("Resumix");
  });

  it("rewrites Resumix to Signalyz when source resume identifies Signalyz", () => {
    expect(maybeNormalizeProjectName("Resumix", "Founder of Signalyz AI SaaS product.")).toBe("Signalyz");
  });

  it("passes integrity validation after sanitization", () => {
    const resume = baseResume({
      core_competencies: ["Email, Chat), Payroll"],
      experience: [
        {
          title: "CSR",
          company: "NJDOL",
          dates: "2019 – 2023",
          bullets: ["Managed casework.", "kind o."],
        },
      ],
    });
    const { resume: cleaned } = sanitizeCalibratedResume(resume, {
      jdText: CARMAX_JD,
      originalResumeText: ORIGINAL_WITH_AST,
    });
    const issues = validateCalibratedResumeIntegrity(cleaned);
    expect(issues.filter((i) => /orphan|company-only|parenthesis/i.test(i))).toEqual([]);
  });
});

describe("calibratedResumeSanitizer — export path (Phase 10.0)", () => {
  it("normalizeResumeForExport applies sanitization before PDF layout", () => {
    const resume = baseResume({
      summary: "WHY JUSTWORKS\n\nThe Justworks support model depends on accuracy.",
      core_competencies: ["Email, Chat), Payroll"],
    });

    const model = normalizeResumeForExport(resume, { jdText: CARMAX_JD });
    expect(model.summary).not.toMatch(/WHY\s+JUSTWORKS/i);
    expect(model.competencies.join(" ")).not.toMatch(/Chat\),/);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.text(model.header.name, 20, 20);
    const buf = doc.output("arraybuffer");
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it("normalizeResumeForExport produces DOCX-packable content", async () => {
    const resume = baseResume();
    const model = normalizeResumeForExport(resume, { jdText: CARMAX_JD });
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun({ text: model.header.name })],
            }),
            ...model.experience.flatMap((exp) =>
              (exp.bullets || []).map(
                (b) =>
                  new Paragraph({
                    children: [new TextRun({ text: b })],
                  }),
              ),
            ),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });
});
