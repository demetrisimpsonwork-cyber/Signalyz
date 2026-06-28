import { describe, it, expect } from "vitest";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import {
  normalizeResumeForExport,
  formatBulletForDisplay,
  cleanCertificationText,
  RESUME_SECTION_LABELS,
} from "@/lib/resumeExportModel";

const baseResume: CalibratedResumeData = {
  header: {
    name: "Demetri Simpson",
    title: "Customer Service Specialist",
    email: "demetri@example.com",
    phone: "(555) 123-4567",
    linkedin: "",
    location: "Newark, NJ",
  },
  summary: "Phone support specialist with escalation experience.",
  core_competencies: ["Escalation handling", "SLA compliance"],
  experience: [
    {
      title: "CSR",
      company: "NJDOL",
      dates: "2019 – 2023",
      bullets: [
        "Manage inbound phone inquiries and route escalations across teams.",
        "A".repeat(250),
      ],
    },
  ],
  independent_projects: [],
  skills: ["Hidden skill not in competencies"],
  certifications: ["[Cert](https://example.com)"],
  education: [{ degree: "BS", institution: "State University", year: "2015" }],
  signal_keywords: [],
};

describe("resumeExportModel", () => {
  it("uses canvas section labels", () => {
    expect(RESUME_SECTION_LABELS.experience).toBe("Experience");
    expect(RESUME_SECTION_LABELS.summary).toBe("Professional Summary");
  });

  it("does not merge skills into competencies", () => {
    const model = normalizeResumeForExport(baseResume);
    expect(model.competencies).toEqual(["Escalation handling", "SLA compliance"]);
    expect(model.competenciesText).not.toContain("Hidden skill");
  });

  it("preserves full bullet length without truncation", () => {
    const model = normalizeResumeForExport(baseResume);
    expect(model.experience[0].bullets[1].length).toBeGreaterThanOrEqual(250);
  });

  it("formats bullets to past tense for display", () => {
    expect(formatBulletForDisplay("Manage inbound calls")).toMatch(/^Managed/);
  });

  it("formats contact line with pipe separators like preview", () => {
    const model = normalizeResumeForExport(baseResume);
    expect(model.header.contactLine).toBe(
      "Newark, NJ  |  demetri@example.com  |  (555) 123-4567",
    );
  });

  it("cleans certification URLs", () => {
    expect(cleanCertificationText("[Cert](https://example.com)")).toBe("Cert");
  });

  it("maps experience title company dates separately for layout", () => {
    const model = normalizeResumeForExport(baseResume);
    expect(model.experience[0]).toEqual({
      title: "CSR",
      company: "NJDOL",
      dates: "2019 – 2023",
      bullets: expect.any(Array),
    });
  });
});
