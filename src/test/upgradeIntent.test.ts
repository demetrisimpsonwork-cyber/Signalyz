import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  authUrlForUpgradeIntent,
  clearUpgradeIntent,
  parseUpgradeIntent,
  postAuthReturnPath,
  readStoredUpgradeIntent,
  rememberUpgradeIntent,
} from "@/lib/upgradeIntent";

describe("upgradeIntent", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("builds auth URLs with tier intent", () => {
    expect(authUrlForUpgradeIntent("one_time")).toBe("/auth?redirect=upgrade&intent=one_time");
    expect(authUrlForUpgradeIntent("subscription")).toBe("/auth?redirect=upgrade&intent=subscription");
  });

  it("parses and stores upgrade intent", () => {
    expect(parseUpgradeIntent("?redirect=upgrade&intent=one_time")).toBe("one_time");
    expect(parseUpgradeIntent("?redirect=upgrade&intent=subscription")).toBe("subscription");
    expect(parseUpgradeIntent("?redirect=upgrade&intent=invalid")).toBeNull();

    rememberUpgradeIntent("subscription");
    expect(readStoredUpgradeIntent()).toBe("subscription");
    clearUpgradeIntent();
    expect(readStoredUpgradeIntent()).toBeNull();
  });

  it("returns post-auth upgrade open path when intent exists", () => {
    expect(postAuthReturnPath("one_time")).toBe("/?upgrade=open&intent=one_time");
    expect(postAuthReturnPath("subscription")).toBe("/?upgrade=open&intent=subscription");
    expect(postAuthReturnPath(null)).toBe("/");
  });
});
