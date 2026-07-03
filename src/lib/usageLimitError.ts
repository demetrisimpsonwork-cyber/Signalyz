import { StructuredEdgeError } from "./resilientEdgeFn";
import { toast } from "sonner";
import { trackReliabilityError } from "@/lib/analytics";

const USAGE_LIMIT_MSG = "Daily limit reached. Sign up to continue.";

function trackEntitlementError(code: string): void {
  if (code === "USAGE_LIMIT_REACHED") {
    trackReliabilityError("rate_limit_reached", code);
  } else if (code === "PRO_REQUIRED") {
    trackReliabilityError("pro_required_error", code);
  } else if (code === "AUTH_REQUIRED") {
    trackReliabilityError("auth_required_error", code);
  }
}

/**
 * Check if an error or response data indicates USAGE_LIMIT_REACHED.
 * If so, show a toast and return true. Otherwise return false.
 */
export function handleUsageLimitError(err: unknown): boolean {
  // From StructuredEdgeError (invokeResilient path)
  if (err instanceof StructuredEdgeError) {
    if (err.error_code === "USAGE_LIMIT_REACHED") {
      trackEntitlementError(err.error_code);
      toast.error(USAGE_LIMIT_MSG);
      return true;
    }
    if (err.error_code === "PRO_REQUIRED") {
      trackEntitlementError(err.error_code);
      return false;
    }
    if (err.error_code === "AUTH_REQUIRED") {
      trackEntitlementError(err.error_code);
      return false;
    }
  }
  return false;
}

/**
 * Check raw response data from supabase.functions.invoke for usage limit.
 * Returns true (and toasts) if limit reached.
 */
export function checkUsageLimitData(data: any): boolean {
  const code = data?.error_code;
  if (data?.status === "error" && code === "USAGE_LIMIT_REACHED") {
    trackEntitlementError(code);
    toast.error(data?.message || USAGE_LIMIT_MSG);
    return true;
  }
  if (data?.status === "error" && (code === "PRO_REQUIRED" || code === "AUTH_REQUIRED")) {
    trackEntitlementError(code);
  }
  return false;
}
