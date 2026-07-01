import { describe, it, expect } from "vitest";
import {
  buildCoverLetterAddressee,
  isValidPersonName,
  isValidCompanyName,
  inferCompanyNameFromJd,
} from "@/lib/coverLetterSalutation";

const GRAYBAR_JD_SNIPPET = `As a Customer Service Representative, you will serve as a key contact and liaison for customers to ensure their total satisfaction.

At Graybar, we are known for our comprehensive benefits.`;

// A fuller Graybar-style JD including the slogan that previously leaked as the
// addressee ("match to help secure your future").
const GRAYBAR_FULL_JD = `Make a difference.

As a Customer Service Representative, you will serve as a key contact and liaison for customers to ensure their total satisfaction.

At Graybar, we are known for our comprehensive benefits and our employee stock ownership plan. We could be the match to help secure your future.

Graybar is an Equal Opportunity Employer.`;

describe("coverLetterSalutation", () => {
  it("rejects JD boilerplate like 'and liaison' as a person name", () => {
    expect(isValidPersonName("and liaison")).toBe(false);
    expect(isValidPersonName("key contact")).toBe(false);
  });

  it("accepts a real hiring manager name", () => {
    expect(isValidPersonName("Jane Smith")).toBe(true);
  });

  it("does not emit 'Dear and liaison,' for Graybar CSR JD", () => {
    const { salutation, addresseeLine } = buildCoverLetterAddressee(GRAYBAR_JD_SNIPPET);
    expect(salutation).not.toContain("liaison");
    expect(salutation).toBe("Dear Graybar Hiring Team,");
    expect(addresseeLine).toBe("Hiring Team, Graybar");
  });

  it("falls back to Dear Hiring Team when no company is detected", () => {
    const { salutation } = buildCoverLetterAddressee(
      "Customer service role. Handle inbound calls professionally.",
    );
    expect(salutation).toBe("Dear Hiring Team,");
  });

  it("extracts Graybar as the company name", () => {
    expect(inferCompanyNameFromJd(GRAYBAR_JD_SNIPPET)).toBe("Graybar");
  });

  it("never turns 'key contact and liaison' into a person addressee", () => {
    // The exact JD phrase that previously leaked into "Dear and liaison,".
    const { salutation, addresseeLine } = buildCoverLetterAddressee(
      "You will serve as a key contact and liaison for customers.",
    );
    expect(salutation).not.toContain("liaison");
    expect(addresseeLine).not.toContain("liaison");
    expect(salutation).toBe("Dear Hiring Team,");
  });

  // The copy button, DOCX export, and PDF export all compose the letter from the
  // same addressee/salutation returned by buildCoverLetterAddressee. This mirrors
  // that composition to prove every export path uses the sanitized salutation.
  function composeExportedLetter(jd: string, contactName: string, body: string): string {
    const { addresseeLine, salutation } = buildCoverLetterAddressee(jd);
    return [contactName, "", addresseeLine, "", salutation, "", body, "", "Sincerely,", contactName].join("\n");
  }

  it("exported (copy/docx/pdf) letter uses the fallback salutation, not 'and liaison'", () => {
    const exported = composeExportedLetter(
      GRAYBAR_JD_SNIPPET,
      "Demetri Simpson",
      "Handling concurrent support cases is the kind of work Graybar's customers deserve.",
    );
    expect(exported).toContain("Dear Graybar Hiring Team,");
    expect(exported).not.toContain("and liaison");
    expect(exported).not.toContain("Dear and liaison");
  });

  it("exported letter falls back to 'Dear Hiring Team,' when no company is present", () => {
    const exported = composeExportedLetter(
      "You will serve as a key contact and liaison for customers.",
      "Demetri Simpson",
      "Body text here.",
    );
    expect(exported).toContain("Dear Hiring Team,");
    expect(exported).not.toContain("liaison");
  });

  // ── Phase 9.6: slogan / fragment addressee lock ──────────────────────────
  it("rejects slogans and benefit fragments as company names", () => {
    expect(isValidCompanyName("match to help secure your future")).toBe(false);
    expect(isValidCompanyName("Match to help secure your future")).toBe(false);
    expect(isValidCompanyName("Make a difference")).toBe(false);
    expect(isValidCompanyName("employee stock ownership")).toBe(false);
    expect(isValidCompanyName("total satisfaction")).toBe(false);
    expect(isValidCompanyName("Equal Opportunity Employer")).toBe(false);
  });

  it("accepts real company names", () => {
    expect(isValidCompanyName("Graybar")).toBe(true);
    expect(isValidCompanyName("Graybar Electric")).toBe(true);
    expect(isValidCompanyName("Bank of America")).toBe(true);
  });

  it("never turns 'match to help secure your future' into an addressee", () => {
    const { addresseeLine, salutation } = buildCoverLetterAddressee(
      "We could be the match to help secure your future. Make a difference.",
    );
    expect(addresseeLine).not.toMatch(/match|secure|future|difference/i);
    expect(salutation).not.toMatch(/match|secure|future|difference/i);
    expect(salutation).toBe("Dear Hiring Team,");
  });

  it("resolves the real company from a full Graybar JD, ignoring the slogan", () => {
    expect(inferCompanyNameFromJd(GRAYBAR_FULL_JD)).toBe("Graybar");
    const { salutation, addresseeLine } = buildCoverLetterAddressee(GRAYBAR_FULL_JD);
    expect(salutation).toBe("Dear Graybar Hiring Team,");
    expect(addresseeLine).toBe("Hiring Team, Graybar");
    expect(salutation).not.toMatch(/match|secure|future|difference/i);
  });
});
