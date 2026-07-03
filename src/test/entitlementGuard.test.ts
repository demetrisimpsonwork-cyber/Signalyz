import { describe, expect, it } from "vitest";
import {
  buildEntitlementErrorBody,
  buildAlignmentUsageIdentity,
  evaluateOptimizeBulletAccess,
  evaluateProGatedAccess,
  shouldProceedToAnthropic,
} from "../../supabase/functions/_shared/entitlementGuard.ts";

const freeEntitlements = { isProEntitled: false };
const proEntitlements = { isProEntitled: true };

describe("evaluateProGatedAccess", () => {
  it("rejects missing JWT (no verified user)", () => {
    expect(evaluateProGatedAccess(null, freeEntitlements)).toBe("AUTH_REQUIRED");
    expect(evaluateProGatedAccess(null, proEntitlements)).toBe("AUTH_REQUIRED");
  });

  it("rejects valid free user for Pro output", () => {
    expect(evaluateProGatedAccess("user-free", freeEntitlements)).toBe("PRO_REQUIRED");
  });

  it("allows valid Pro user", () => {
    expect(evaluateProGatedAccess("user-pro", proEntitlements)).toBeNull();
  });

  it("blocks Anthropic when gate fails", () => {
    const gate = evaluateProGatedAccess(null, proEntitlements);
    expect(shouldProceedToAnthropic(gate)).toBe(false);
  });

  it("allows Anthropic when Pro user passes", () => {
    const gate = evaluateProGatedAccess("user-pro", proEntitlements);
    expect(shouldProceedToAnthropic(gate)).toBe(true);
  });
});

describe("evaluateOptimizeBulletAccess", () => {
  const proUserId = "11111111-1111-4111-8111-111111111111";
  const spoofedProUserId = "22222222-2222-4222-8222-222222222222";

  it("ignores body userId — spoofed Pro UUID without JWT does not grant multi_bullet", () => {
    const gate = evaluateOptimizeBulletAccess({
      verifiedUserId: null,
      mode: "multi_bullet",
      entitlements: proEntitlements,
    });
    expect(gate).toBe("AUTH_REQUIRED");
    void spoofedProUserId;
  });

  it("rejects multi_bullet for verified free user", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: proUserId,
        mode: "multi_bullet",
        entitlements: freeEntitlements,
      }),
    ).toBe("PRO_REQUIRED");
  });

  it("allows multi_bullet for verified Pro user", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: proUserId,
        mode: "multi_bullet",
        entitlements: proEntitlements,
      }),
    ).toBeNull();
  });

  it("allows single_bullet for unauthenticated guest", () => {
    expect(
      evaluateOptimizeBulletAccess({
        verifiedUserId: null,
        mode: "single_bullet",
        entitlements: freeEntitlements,
      }),
    ).toBeNull();
  });

  it("blocks Anthropic for unauthorized multi_bullet", () => {
    const gate = evaluateOptimizeBulletAccess({
      verifiedUserId: null,
      mode: "multi_bullet",
      entitlements: proEntitlements,
    });
    expect(shouldProceedToAnthropic(gate)).toBe(false);
  });
});

describe("buildAlignmentUsageIdentity", () => {
  const uuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const isValid = (t: unknown): t is string =>
    typeof t === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);

  it("binds authenticated usage to verified user id only", () => {
    expect(buildAlignmentUsageIdentity("user-1", uuid, isValid)).toEqual({
      userId: "user-1",
      sessionToken: null,
    });
  });

  it("binds guest usage to session token when unauthenticated", () => {
    expect(buildAlignmentUsageIdentity(null, uuid, isValid)).toEqual({
      userId: null,
      sessionToken: uuid,
    });
  });
});

describe("buildEntitlementErrorBody", () => {
  it("returns safe error payload without secrets or stack traces", () => {
    const body = buildEntitlementErrorBody("PRO_REQUIRED", "req-1");
    expect(body).toEqual({
      status: "error",
      error: "PRO_REQUIRED",
      error_code: "PRO_REQUIRED",
      message: expect.any(String),
      request_id: "req-1",
    });
    expect(JSON.stringify(body)).not.toMatch(/stack|secret|api[_-]?key/i);
  });

  it("includes AUTH_REQUIRED for missing JWT", () => {
    const body = buildEntitlementErrorBody("AUTH_REQUIRED");
    expect(body.error).toBe("AUTH_REQUIRED");
    expect(body.error_code).toBe("AUTH_REQUIRED");
  });
});

describe("generate-pro-content / assemble / resume-summary gate simulation", () => {
  it("simulate handler: free JWT rejected before AI", () => {
    let anthropicCalled = false;
    const gate = evaluateProGatedAccess("free-user", freeEntitlements);
    if (shouldProceedToAnthropic(gate)) anthropicCalled = true;
    expect(gate).toBe("PRO_REQUIRED");
    expect(anthropicCalled).toBe(false);
  });

  it("simulate handler: missing JWT rejected before AI", () => {
    let anthropicCalled = false;
    const gate = evaluateProGatedAccess(null, freeEntitlements);
    if (shouldProceedToAnthropic(gate)) anthropicCalled = true;
    expect(gate).toBe("AUTH_REQUIRED");
    expect(anthropicCalled).toBe(false);
  });

  it("simulate handler: Pro JWT allowed to proceed", () => {
    let anthropicCalled = false;
    const gate = evaluateProGatedAccess("pro-user", proEntitlements);
    if (shouldProceedToAnthropic(gate)) anthropicCalled = true;
    expect(gate).toBeNull();
    expect(anthropicCalled).toBe(true);
  });
});

describe("generate-resume-summary auth simulation", () => {
  it("publishable-key-only (no verified user) is rejected", () => {
    expect(evaluateProGatedAccess(null, freeEntitlements)).toBe("AUTH_REQUIRED");
  });

  it("authenticated free user is rejected when Pro-gated", () => {
    expect(evaluateProGatedAccess("user", freeEntitlements)).toBe("PRO_REQUIRED");
  });

  it("Pro user is allowed", () => {
    expect(evaluateProGatedAccess("user", proEntitlements)).toBeNull();
  });
});
