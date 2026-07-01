/**
 * Display labels for the Hiring Report — frontend-only override so non-leadership
 * target roles (CSR, specialist, coordinator) never read as "Supervisor Signal Tier."
 */

const NON_LEADERSHIP_ROLE =
  /\b(representative|specialist|coordinator|associate|agent|analyst|administrator|clerk|technician|support|customer service|csr)\b/i;

const LEADERSHIP_ROLE =
  /\b(director|vp|vice president|head of|chief|executive|president|general manager|regional manager|department manager|people manager)\b/i;

const MANAGEMENT_WITH_TEAM =
  /\b(manager|supervisor|lead)\b/i;

/** True when the inferred target role clearly implies people/process leadership. */
export function targetRoleImpliesLeadership(targetRoleTitle: string): boolean {
  const title = targetRoleTitle.trim();
  if (!title) return true; // no title → keep backend label

  const lower = title.toLowerCase();

  if (LEADERSHIP_ROLE.test(lower)) return true;

  if (MANAGEMENT_WITH_TEAM.test(lower) && !NON_LEADERSHIP_ROLE.test(lower)) {
    return true;
  }

  if (NON_LEADERSHIP_ROLE.test(lower)) return false;

  // Ambiguous titles default to leadership framing only when explicitly managerial.
  return MANAGEMENT_WITH_TEAM.test(lower);
}

/**
 * Resolve the section label prefix for Hiring Report blocks
 * (e.g. "Candidate Signal Tier" vs "Supervisor Signal Tier").
 */
export function resolveHiringReportRoleLabel(
  backendLabel: string | undefined,
  targetRoleTitle?: string | null,
): string {
  if (targetRoleTitle && !targetRoleImpliesLeadership(targetRoleTitle)) {
    return "Candidate";
  }
  return backendLabel?.trim() || "Director";
}
