import { describe, it, expect } from "vitest";
import {
  assignSourceRoleIds,
  buildSourceRoleId,
  normalizeSourceDates,
  parseSourceExperienceRolesFromText,
  validateExperienceRoleShell,
  lockExperienceToSourceTruth,
  enforceExperienceRenderInvariants,
} from "@/lib/sourceExperienceParser";
import {
  DEMETRI_KONG_AI_ENABLEMENT_RESUME,
  DEMETRI_PINTEREST_RESUME,
  DEMETRI_PINTEREST_RESUME_DOCX_SOURCE,
  DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE,
  corruptedPinterestPmCalibratedResume,
  headerLayoutCorruptedPinterestPmCalibratedResume,
  njdolDuplicateLocationCalibratedResume,
} from "@/test/fixtures/outputQa/pinterestPmFixtures";

function assertKongSourceRoles(sourceText: string) {
  const roles = parseSourceExperienceRolesFromText(sourceText);
  expect(roles).toHaveLength(4);

  const signalyz = roles.find((r) => /Signalyz/i.test(r.company))!;
  const njdol = roles.find((r) => /Department of Labor/i.test(r.company))!;
  const nthrive = roles.find((r) => /nThrive/i.test(r.company))!;
  const ast = roles.find((r) => /AST Fund Solutions/i.test(r.company))!;

  expect(signalyz.title).toMatch(/Founder & AI Enablement Engineer/i);
  expect(signalyz.dates).toMatch(/2024/i);
  expect(signalyz.dates).toMatch(/Present/i);
  expect(signalyz.location || "").toBe("");

  expect(njdol.title).toMatch(/Claims Examiner/i);
  expect(njdol.dates).toMatch(/Jan\s+2024/i);
  expect(njdol.dates).toMatch(/Jul\s+2026/i);
  expect(njdol.location).toMatch(/Trenton,\s*NJ/i);

  expect(nthrive.title).toMatch(/Revenue Cycle/i);
  expect(nthrive.dates).toMatch(/2021/i);
  expect(nthrive.dates).toMatch(/2023/i);

  expect(ast.title).toMatch(/Team Lead/i);
  expect(ast.title).toMatch(/Proxy Voting Specialist/i);
  expect(ast.dates).toMatch(/2016/i);
  expect(ast.dates).toMatch(/2020/i);

  return roles;
}

function assertPinterestSourceRoles(sourceText: string) {
  const roles = parseSourceExperienceRolesFromText(sourceText);
  expect(roles).toHaveLength(4);

  const signalyz = roles.find((r) => /Signalyz/i.test(r.company))!;
  const njdol = roles.find((r) => /Department of Labor/i.test(r.company))!;
  const nthrive = roles.find((r) => /nThrive/i.test(r.company))!;
  const ast = roles.find((r) => /AST Fund Solutions/i.test(r.company))!;

  expect(signalyz.company).toMatch(/Signalyz\.ai/i);
  expect(signalyz.title).toMatch(/^Founder$/i);
  expect(signalyz.dates).toMatch(/2024/i);
  expect(signalyz.dates).toMatch(/Present/i);
  expect(signalyz.location).toMatch(/Phillipsburg,\s*NJ/i);

  expect(njdol.company).toMatch(/New Jersey Department of Labor/i);
  expect(njdol.title).toMatch(/Claims Examiner/i);
  expect(njdol.dates).toMatch(/Jan\s+2023/i);
  expect(njdol.dates).toMatch(/Jun\s+2024/i);
  expect(njdol.location).toMatch(/Trenton,\s*NJ/i);

  expect(nthrive.title).toMatch(/Revenue Cycle & Compliance Support/i);
  expect(nthrive.dates).toMatch(/2021/i);
  expect(nthrive.dates).toMatch(/2023/i);
  expect(nthrive.location).toMatch(/^Remote$/i);

  expect(ast.title).toMatch(/Team Lead, Proxy Voting Specialist, Client Communications/i);
  expect(ast.dates).toMatch(/2016/i);
  expect(ast.dates).toMatch(/2020/i);
  expect(ast.location).toMatch(/^Remote$/i);

  for (const role of roles) {
    expect(validateExperienceRoleShell({
      company: role.company,
      title: role.title,
      dates: role.dates,
      location: role.location,
      bullets: role.bullets,
    })).toEqual([]);
  }

  return roles;
}

describe("sourceExperienceParser — Kong pipe layout", () => {
  it("parses Kong AI Enablement source into four roles", () => {
    assertKongSourceRoles(DEMETRI_KONG_AI_ENABLEMENT_RESUME);
  });

  it("assigns stable sourceRoleIds for Kong roles", () => {
    const roles = assertKongSourceRoles(DEMETRI_KONG_AI_ENABLEMENT_RESUME);
    const withIds = assignSourceRoleIds(roles);
    expect(withIds[0].sourceRoleId).toBe(buildSourceRoleId(0, roles[0]));
    expect(new Set(withIds.map((r) => r.sourceRoleId)).size).toBe(4);
  });
});

describe("sourceExperienceParser — Pinterest layouts", () => {
  it("parses pipe-format Pinterest source into four roles", () => {
    assertPinterestSourceRoles(DEMETRI_PINTEREST_RESUME);
  });

  it("parses DOCX block-layout Pinterest source into four roles", () => {
    assertPinterestSourceRoles(DEMETRI_PINTEREST_RESUME_DOCX_SOURCE);
  });

  it("parses em-dash split Pinterest v5 source into four roles", () => {
    assertPinterestSourceRoles(DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE);
  });

  it("assigns stable sourceRoleIds for Pinterest v5 roles", () => {
    const roles = assertPinterestSourceRoles(DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE);
    const withIds = assignSourceRoleIds(roles);
    expect(withIds).toHaveLength(4);
    expect(new Set(withIds.map((r) => r.sourceRoleId)).size).toBe(4);
  });
});

describe("sourceExperienceParser — date normalization", () => {
  it("normalizes dash spacing without changing meaning", () => {
    expect(normalizeSourceDates("2024–Present")).toMatch(/2024.*Present/i);
    expect(normalizeSourceDates("Jan 2023–Jun 2024")).toMatch(/Jan 2023.*Jun 2024/i);
    expect(normalizeSourceDates("2021 – 2023")).toMatch(/2021.*2023/);
    expect(extractYearPair("Jan 2023–Jun 2024")).toEqual(["2023", "2024"]);
    expect(extractYearPair("2024 – Present")).toEqual(["2024"]);
  });
});

function extractYearPair(dates: string): string[] {
  return (dates.match(/\d{4}/g) || []).slice(0, 2);
}

describe("sourceExperienceParser — source role locking", () => {
  it("rehydrates corrupted Pinterest output to exactly four source roles", () => {
    const corrupted = corruptedPinterestPmCalibratedResume();
    const repaired: string[] = [];
    const locked = lockExperienceToSourceTruth(
      corrupted.experience,
      DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE,
      repaired,
    );

    expect(locked).toHaveLength(4);
    assertPinterestSourceRoles(DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE);

    for (const role of locked) {
      expect(validateExperienceRoleShell(role)).toEqual([]);
      expect(role.company).not.toMatch(/^\d/);
      expect(role.title).not.toMatch(/Trenton/i);
    }
  });

  it("repairs header-layout corruption via enforceExperienceRenderInvariants", () => {
    const corrupted = headerLayoutCorruptedPinterestPmCalibratedResume();
    const repaired: string[] = [];
    const output = enforceExperienceRenderInvariants(
      corrupted.experience,
      DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE,
      repaired,
    );

    expect(output).toHaveLength(4);
    expect(output.find((r) => /Department of Labor/i.test(r.company))?.title).toMatch(/Claims Examiner/i);
    expect(output.find((r) => /Trenton/i.test(r.location || ""))?.company).toMatch(/Department of Labor/i);
  });

  it("repairs NJDOL duplicate location corruption", () => {
    const corrupted = njdolDuplicateLocationCalibratedResume();
    const repaired: string[] = [];
    const output = enforceExperienceRenderInvariants(
      corrupted.experience,
      DEMETRI_PINTEREST_RESUME_V5_EMDASH_SOURCE,
      repaired,
    );

    const signalyz = output.find((r) => /Signalyz/i.test(r.company))!;
    const njdol = output.find((r) => /Department of Labor/i.test(r.company))!;

    expect(signalyz.location).toMatch(/Phillipsburg/i);
    expect(njdol.company).toMatch(/Department of Labor/i);
    expect(njdol.title).toMatch(/Claims Examiner/i);
    expect(njdol.company).not.toMatch(/Trenton/i);
  });

  it("does not regress Kong role structure when locking against Kong source", () => {
    const experience = parseSourceExperienceRolesFromText(DEMETRI_KONG_AI_ENABLEMENT_RESUME).map((r) => ({
      company: r.company,
      title: r.title,
      dates: r.dates,
      location: r.location,
      bullets: r.bullets,
    }));
    const repaired: string[] = [];
    const locked = enforceExperienceRenderInvariants(
      experience,
      DEMETRI_KONG_AI_ENABLEMENT_RESUME,
      repaired,
    );

    expect(locked).toHaveLength(4);
    expect(locked.find((r) => /Signalyz/i.test(r.company))?.title).toMatch(/AI Enablement/i);
    expect(locked.find((r) => /Department of Labor/i.test(r.company))?.dates).toMatch(/Jul 2026/i);
  });
});
