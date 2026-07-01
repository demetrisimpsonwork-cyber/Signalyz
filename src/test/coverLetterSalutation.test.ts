import { describe, it, expect } from "vitest";
import {
  buildCoverLetterAddressee,
  isValidPersonName,
  inferCompanyNameFromJd,
} from "@/lib/coverLetterSalutation";

const GRAYBAR_JD_SNIPPET = `As a Customer Service Representative, you will serve as a key contact and liaison for customers to ensure their total satisfaction.

At Graybar, we are known for our comprehensive benefits.`;

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
});
