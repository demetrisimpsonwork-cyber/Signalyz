import { describe, it, expect } from "vitest";
import {
  scoreBulletStrength,
  rankBulletsByStrength,
  diversifyBulletOpenings,
} from "../../supabase/functions/_shared/bulletStrength";

describe("rankBulletsByStrength — strongest first within a role", () => {
  it("promotes the measurable, ownership bullet above a passive one", () => {
    const bullets = [
      "Assisted with filing paperwork as needed.",
      "Led a team of 12 that increased revenue by 30%.",
    ];
    const ranked = rankBulletsByStrength(bullets);
    expect(ranked[0]).toBe("Led a team of 12 that increased revenue by 30%.");
  });

  it("scores a metric+ownership bullet higher than a vague one", () => {
    const strong = scoreBulletStrength("Drove a cross-functional rollout that reduced costs by 25%.");
    const weak = scoreBulletStrength("Helped out with various tasks.");
    expect(strong).toBeGreaterThan(weak);
  });

  it("does not change facts, only order", () => {
    const bullets = ["Owned the P&L.", "Coordinated scheduling."];
    const ranked = rankBulletsByStrength(bullets);
    expect([...ranked].sort()).toEqual([...bullets].sort());
  });

  it("returns short lists unchanged", () => {
    expect(rankBulletsByStrength(["Only one bullet."])).toEqual(["Only one bullet."]);
  });

  it("empty bullets score as negative infinity", () => {
    expect(scoreBulletStrength("")).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("diversifyBulletOpenings — reduce repeated leading verbs", () => {
  it("varies repeated 'Managed' openings with meaning-preserving synonyms", () => {
    const used = new Map<string, number>();
    const result = diversifyBulletOpenings(
      [
        "Managed intake queue.",
        "Managed vendor relationships.",
        "Managed onboarding.",
      ],
      used,
    );
    expect(result).toEqual([
      "Managed intake queue.",
      "Oversaw vendor relationships.",
      "Directed onboarding.",
    ]);
  });

  it("shares the counter across roles", () => {
    const used = new Map<string, number>();
    diversifyBulletOpenings(["Managed payroll."], used);
    const second = diversifyBulletOpenings(["Managed inventory."], used);
    expect(second[0]).not.toBe("Managed inventory.");
  });

  it("leaves a bullet untouched when no synonym exists", () => {
    const used = new Map<string, number>();
    const result = diversifyBulletOpenings(
      ["Spearheaded launch.", "Spearheaded migration."],
      used,
    );
    expect(result[1]).toBe("Spearheaded migration.");
  });
});
