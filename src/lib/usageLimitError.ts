import { StructuredEdgeError } from "./resilientEdgeFn";
import { toast } from "sonner";

const USAGE_LIMIT_MSG = "Daily limit reached. Sign up to continue.";

/**
 * Check if an error or response data indicates USAGE_LIMIT_REACHED.
 * If so, show a toast and return true. Otherwise return false.
 */
export function handleUsageLimitError(err: unknown): boolean {
  // From StructuredEdgeError (invokeResilient path)
  if (err instanceof StructuredEdgeError && err.error_code === "USAGE_LIMIT_REACHED") {
    toast.error(USAGE_LIMIT_MSG);
    return true;
  }
  return false;
}

/**
 * Check raw response data from supabase.functions.invoke for usage limit.
 * Returns true (and toasts) if limit reached.
 */
export function checkUsageLimitData(data: any): boolean {
  if (data?.status === "error" && data?.error_code === "USAGE_LIMIT_REACHED") {
    toast.error(data?.message || USAGE_LIMIT_MSG);
    return true;
  }
  return false;
}
