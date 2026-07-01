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

// Phase 9.7 QA fixture — the real CarMax JD (representative subset with the
// slogan, store location, "At CarMax" mentions, and benefits section).
const CARMAX_JD = `6075 - Easton - Nazareth - 3835 Easton-Nazareth Hwy, Easton, Pennsylvania, 18045
CarMax, the way your career should be!

As a Customer Specialist in Training, you will be empowered to deliver an iconic, customer-first experience that defines CarMax. At CarMax, honesty and integrity are the foundation of our success.

At CarMax, we are the nation's largest retailer of used cars with stores from coast to coast.

Benefits: CarMax Associates are entitled to paid sick, vacation, and holiday time. For more details about benefits, please visit our CarMax Benefits website.

CarMax is an equal opportunity employer.`;

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
    // No separate recipient block — the salutation is the only addressee line.
    expect(addresseeLine).toBe("");
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

  // Mirrors CoverLetterEngine.fullLetterText exactly: the addressee line is only
  // emitted when non-empty (copy/DOCX/PDF share this composition).
  function composeExportedLetterClean(jd: string, contactName: string, body: string): string {
    const { addresseeLine, salutation } = buildCoverLetterAddressee(jd);
    const parts: string[] = [contactName, ""];
    if (addresseeLine) {
      parts.push(addresseeLine, "");
    }
    parts.push(salutation, "", body, "", "Sincerely,", contactName);
    return parts.join("\n");
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
    expect(addresseeLine).toBe("");
    expect(salutation).not.toMatch(/match|secure|future|difference/i);
  });

  // ── Phase 9.7: CarMax fixture ────────────────────────────────────────────
  it("resolves CarMax and never uses slogan/location/benefits as addressee", () => {
    expect(inferCompanyNameFromJd(CARMAX_JD)).toBe("CarMax");
    const { salutation, addresseeLine } = buildCoverLetterAddressee(CARMAX_JD);
    expect(salutation).toBe("Dear CarMax Hiring Team,");
    // No duplicate "Hiring Team, CarMax" recipient block.
    expect(addresseeLine).toBe("");
    // Slogan / location / benefits must never appear in the salutation.
    expect(salutation).not.toMatch(/the way your career should be/i);
    expect(salutation).not.toMatch(/Easton|Nazareth|Pennsylvania|18045/i);
    expect(salutation).not.toMatch(/benefit|vacation|holiday|sick/i);
  });

  it("rejects the CarMax slogan as a company name and accepts the real name", () => {
    expect(isValidCompanyName("CarMax, the way your career should be!")).toBe(false);
    expect(isValidCompanyName("the way your career should be")).toBe(false);
    expect(isValidCompanyName("CarMax")).toBe(true);
    // The store-location line is never preceded by a company trigger word, so it
    // is not even considered as a candidate (verified at the JD level below).
  });

  it("produces a clean exported CarMax letter with only the salutation", () => {
    const exported = composeExportedLetterClean(
      CARMAX_JD,
      "Demetri Simpson",
      "Managing 40-70 concurrent support cases daily is the core of what I do.",
    );
    expect(exported).toContain("Dear CarMax Hiring Team,");
    // The redundant recipient block must not appear.
    expect(exported).not.toContain("Hiring Team, CarMax");
  });
});
