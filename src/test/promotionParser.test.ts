import { describe, it, expect } from "vitest";
import {
  normalizeEmployerPromotions,
  splitBledPromotionHeaders,
  looksLikeRoleTitle,
  extractDateRange,
  type ParsedRole,
} from "../../supabase/functions/_shared/promotionParser";

/**
 * Inputs below model the realistic output of the edge experience parser
 * (`parseExperienceBlock`) for each resume format. `normalizeEmployerPromotions`
 * is the production repair step that runs on exactly this shape.
 */

describe("normalizeEmployerPromotions — same-employer promotion grouping", () => {
  it("1. Amazon-style promotions (company-first): inherits employer onto all titles", () => {
    const input: ParsedRole[] = [
      { title: "Senior Operations Manager", company: "Amazon", dates: "2021 - 2023", bullets: ["Led regional fulfillment operations.", "Reduced defect rate by 18%."] },
      { title: "Operations Manager", company: "", dates: "2019 - 2021", bullets: ["Managed shift scheduling across two sites."] },
      { title: "Operations Associate", company: "", dates: "2017 - 2019", bullets: ["Processed inbound receiving."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.company)).toEqual(["Amazon", "Amazon", "Amazon"]);
    expect(out.map((r) => r.title)).toEqual([
      "Senior Operations Manager",
      "Operations Manager",
      "Operations Associate",
    ]);
    // chronology + dates preserved exactly
    expect(out.map((r) => r.dates)).toEqual(["2021 - 2023", "2019 - 2021", "2017 - 2019"]);
    // bullets stay with their own role (no bleed)
    expect(out[0].bullets).toHaveLength(2);
    expect(out[1].bullets).toEqual(["Managed shift scheduling across two sites."]);
    expect(out[2].bullets).toEqual(["Processed inbound receiving."]);
  });

  it("2. FAANG multi-title career: every promotion keeps the employer", () => {
    const input: ParsedRole[] = [
      { title: "Staff Software Engineer", company: "Google", dates: "2021 - 2024", bullets: ["Led platform reliability work."] },
      { title: "Senior Software Engineer", company: "", dates: "2018 - 2021", bullets: ["Built distributed services."] },
      { title: "Software Engineer", company: "", dates: "2016 - 2018", bullets: ["Shipped API features."] },
      { title: "Software Engineering Intern", company: "", dates: "2015 - 2016", bullets: ["Prototyped internal tools."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(4);
    expect(out.every((r) => r.company === "Google")).toBe(true);
    expect(out.map((r) => r.dates)).toEqual(["2021 - 2024", "2018 - 2021", "2016 - 2018", "2015 - 2016"]);
  });

  it("3. Consulting engagements: employer-header line is collapsed into the employer", () => {
    const input: ParsedRole[] = [
      { title: "Deloitte Consulting", company: "", dates: "2018 - 2023", bullets: [] }, // employer header (carried a span)
      { title: "Manager", company: "", dates: "2021 - 2023", bullets: ["Led a retail transformation engagement."] },
      { title: "Senior Consultant", company: "", dates: "2018 - 2021", bullets: ["Advised clients on operating model design."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.title)).toEqual(["Manager", "Senior Consultant"]);
    expect(out.every((r) => r.company === "Deloitte Consulting")).toBe(true);
  });

  it("4. Military resume: branch header collapsed, rank progression preserved", () => {
    const input: ParsedRole[] = [
      { title: "United States Army", company: "", dates: "2010 - 2018", bullets: [] },
      { title: "Staff Sergeant", company: "", dates: "2015 - 2018", bullets: ["Led a 12-soldier squad on deployment."] },
      { title: "Sergeant", company: "", dates: "2012 - 2015", bullets: ["Trained junior soldiers on logistics."] },
      { title: "Specialist", company: "", dates: "2010 - 2012", bullets: ["Maintained vehicle readiness."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.title)).toEqual(["Staff Sergeant", "Sergeant", "Specialist"]);
    expect(out.every((r) => r.company === "United States Army")).toBe(true);
  });

  it("5. Government resume: agency header collapsed, GS grades preserved as titles", () => {
    const input: ParsedRole[] = [
      { title: "Department of Veterans Affairs", company: "", dates: "2014 - 2023", bullets: [] },
      { title: "Program Analyst, GS-13", company: "", dates: "2019 - 2023", bullets: ["Oversaw benefits processing for a regional office."] },
      { title: "Program Analyst, GS-12", company: "", dates: "2016 - 2019", bullets: ["Adjudicated disability claims."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.company === "Department of Veterans Affairs")).toBe(true);
    expect(out[0].title).toContain("GS-13");
    expect(out[1].title).toContain("GS-12");
  });

  it("6. Employer with 3-4 internal promotions where headers bled into bullets", () => {
    const input: ParsedRole[] = [
      {
        title: "Senior Director",
        company: "Acme Corp",
        dates: "2020 - 2024",
        bullets: [
          "Owned P&L for the platform division.",
          "Director of Product | 2017 - 2020",
          "Drove the roadmap across three product lines.",
          "Product Manager | 2014 - 2017",
          "Launched the flagship product.",
        ],
      },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.title)).toEqual(["Senior Director", "Director of Product", "Product Manager"]);
    expect(out.every((r) => r.company === "Acme Corp")).toBe(true);
    expect(out.map((r) => r.dates)).toEqual(["2020 - 2024", "2017 - 2020", "2014 - 2017"]);
    // no bullet bleed across the promotions
    expect(out[0].bullets).toEqual(["Owned P&L for the platform division."]);
    expect(out[1].bullets).toEqual(["Drove the roadmap across three product lines."]);
    expect(out[2].bullets).toEqual(["Launched the flagship product."]);
  });
});

describe("normalizeEmployerPromotions — false-positive guards", () => {
  it("leaves a clean per-line format untouched", () => {
    const input: ParsedRole[] = [
      { title: "Software Engineer", company: "Acme Inc", dates: "2019 - 2022", bullets: ["Built services.", "Improved latency."] },
      { title: "Data Analyst", company: "Globex LLC", dates: "2016 - 2019", bullets: ["Analyzed datasets."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toEqual(input);
  });

  it("never overwrites an explicit (different) employer", () => {
    const input: ParsedRole[] = [
      { title: "Manager", company: "Amazon", dates: "2021 - 2023", bullets: ["A."] },
      { title: "Analyst", company: "Microsoft", dates: "2018 - 2021", bullets: ["B."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out.map((r) => r.company)).toEqual(["Amazon", "Microsoft"]);
  });

  it("does not split a verb-led bullet that merely contains a date range", () => {
    const input: ParsedRole[] = [
      { title: "Manager", company: "Acme Inc", dates: "2019 - 2022", bullets: ["Led a team from 2019 - 2022 across three regions."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(1);
    expect(out[0].bullets).toHaveLength(1);
  });

  it("does not split a bullet with only a single year (no range)", () => {
    const input: ParsedRole[] = [
      { title: "Manager", company: "Acme Inc", dates: "2019 - 2022", bullets: ["Named manager of the year 2021 for the region."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(1);
  });

  it("does not drop a blank-company row that carries its own bullets", () => {
    const input: ParsedRole[] = [
      { title: "Amazon", company: "", dates: "", bullets: ["High-volume distribution environment."] },
    ];
    const out = normalizeEmployerPromotions(input);
    expect(out).toHaveLength(1);
    expect(out[0].bullets).toHaveLength(1);
  });
});

describe("promotionParser helpers", () => {
  it("looksLikeRoleTitle distinguishes titles from employers", () => {
    expect(looksLikeRoleTitle("Senior Operations Manager")).toBe(true);
    expect(looksLikeRoleTitle("Staff Sergeant")).toBe(true);
    expect(looksLikeRoleTitle("Program Analyst, GS-13")).toBe(true);
    expect(looksLikeRoleTitle("Amazon")).toBe(false);
    expect(looksLikeRoleTitle("United States Army")).toBe(false);
    expect(looksLikeRoleTitle("Led cross-functional teams to deliver results")).toBe(false);
  });

  it("extractDateRange separates a date range from the title", () => {
    expect(extractDateRange("Director of Product | 2017 - 2020")).toEqual({
      dates: "2017 - 2020",
      rest: "Director of Product",
    });
    expect(extractDateRange("Manager 2019 to Present")).toMatchObject({ rest: "Manager" });
    expect(extractDateRange("Manager").dates).toBe("");
  });

  it("splitBledPromotionHeaders keeps a single role when no headers are present", () => {
    const role: ParsedRole = { title: "Manager", company: "Acme Inc", dates: "2019 - 2022", bullets: ["Built things.", "Shipped features."] };
    expect(splitBledPromotionHeaders(role)).toEqual([role]);
  });
});
