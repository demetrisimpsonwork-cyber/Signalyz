import { describe, it, expect } from "vitest";
import {
  shortenBullet,
  capRoleBullets,
  tokenOverlapRatio,
} from "../../supabase/functions/_shared/bulletShaping";

describe("shortenBullet — no mid-sentence truncation", () => {
  it("leaves short bullets untouched", () => {
    const b = "Managed warehouse operations across three shifts.";
    const r = shortenBullet(b);
    expect(r.shortened).toBe(false);
    expect(r.text).toBe(b);
  });

  it("trims at a sentence boundary and never mid-word", () => {
    const s1 = "Managed daily warehouse operations across three regional fulfillment shifts while consistently maintaining order accuracy and throughput.";
    const s2 = "Reduced shipping errors significantly by closely tracking fulfillment metrics every single week alongside the wider operations team.";
    const s3 = "Coordinated inbound vendor deliveries and recurring inventory counts on a dependable weekly operational cadence.";
    const long = `${s1} ${s2} ${s3}`;
    expect(long.length).toBeGreaterThan(240);

    const r = shortenBullet(long, { softCap: 240, hardCap: 280 });
    expect(r.shortened).toBe(true);
    // ends on a complete sentence
    expect(r.text.endsWith(".")).toBe(true);
    // never exceeds the hard cap
    expect(r.text.length).toBeLessThanOrEqual(280);
    // prefers keeping more than the old 200 hard cap when a boundary allows
    expect(r.text.length).toBeGreaterThan(200);
    // the cut happened at a real boundary — no partial trailing word
    expect(/\b\w+$/.test(r.text.replace(/\.$/, ""))).toBe(true);
  });

  it("keeps the full sentence rather than cutting mid-thought when no boundary exists", () => {
    const noBoundary =
      "Managed warehouse operations across three regional fulfillment shifts while maintaining accuracy and reducing shipping errors and coordinating vendor deliveries and inbound inventory counts on a recurring weekly basis without any punctuation breaks anywhere at all across the entire distribution network and supporting teams";
    expect(noBoundary.length).toBeGreaterThan(280);
    const r = shortenBullet(noBoundary, { softCap: 240, hardCap: 280 });
    // no safe boundary → returns full text untouched (never a mid-word cut)
    expect(r.shortened).toBe(false);
    expect(r.text).toBe(noBoundary);
  });
});

describe("capRoleBullets — intentional density policy", () => {
  const distinct = [
    "Managed warehouse operations across three shifts.",
    "Reduced shipping errors by tracking fulfillment metrics weekly.",
    "Coordinated vendor deliveries and inbound inventory counts.",
    "Trained eight new associates on safety and packing standards.",
    "Negotiated freight contracts saving fifteen percent annually.",
  ];

  it("allows 5 bullets for the first role when evidence is distinct", () => {
    const r = capRoleBullets([...distinct], 0);
    expect(r.bullets.length).toBe(5);
    expect(r.reduced).toBe(false);
  });

  it("allows 4 bullets for later roles when evidence is distinct", () => {
    const r = capRoleBullets(distinct.slice(0, 4), 1);
    expect(r.bullets.length).toBe(4);
    expect(r.reduced).toBe(false);
  });

  it("caps the first role at 5 when there are 6 distinct bullets", () => {
    const six = [...distinct, "Audited inbound receiving logs for compliance accuracy."];
    const r = capRoleBullets(six, 0);
    expect(r.bullets.length).toBe(5);
    expect(r.reduced).toBe(true);
    expect(r.from).toBe(6);
    expect(r.to).toBe(5);
  });

  it("merges near-duplicate bullets before dropping unique evidence", () => {
    const withDup = [
      "Managed warehouse operations across three regional shifts.",
      "Managed warehouse operations across three regional shifts daily.", // near-dup
      "Reduced shipping errors by tracking fulfillment metrics weekly.",
      "Coordinated vendor deliveries and inbound inventory counts.",
      "Trained eight new associates on safety and packing standards.",
    ];
    const r = capRoleBullets(withDup, 1); // target 3 / hardMax 4
    // dedup collapses the pair, so all unique evidence survives within the cap
    expect(r.bullets.length).toBeLessThanOrEqual(4);
    expect(r.bullets).toContain("Reduced shipping errors by tracking fulfillment metrics weekly.");
    expect(r.bullets).toContain("Trained eight new associates on safety and packing standards.");
  });

  it("leaves bullet sets at/under target untouched", () => {
    const r = capRoleBullets(distinct.slice(0, 3), 1);
    expect(r.reduced).toBe(false);
    expect(r.bullets.length).toBe(3);
  });
});

describe("tokenOverlapRatio", () => {
  it("returns high overlap for near-identical bullets", () => {
    expect(
      tokenOverlapRatio(
        "Managed warehouse operations across shifts",
        "Managed warehouse operations across regional shifts",
      ),
    ).toBeGreaterThan(0.7);
  });

  it("returns low overlap for distinct bullets", () => {
    expect(
      tokenOverlapRatio(
        "Negotiated freight contracts saving fifteen percent",
        "Trained associates on safety packing standards",
      ),
    ).toBeLessThan(0.3);
  });
});
