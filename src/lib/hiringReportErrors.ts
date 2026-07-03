export type HiringReportErrorCategory =
  | "timeout"
  | "auth_pro_required"
  | "model_error"
  | "parse_validation"
  | "unknown";

export const HIRING_REPORT_USER_MESSAGE =
  "Your Hiring Report couldn't be generated. This can happen with very long or complex resumes — please click retry.";

export function classifyHiringReportErrorCode(
  errorCode?: string,
  message?: string,
): HiringReportErrorCategory {
  const code = (errorCode || "").toUpperCase();
  const msg = (message || "").toLowerCase();

  if (
    code === "TIMEOUT" ||
    msg.includes("timed out") ||
    msg.includes("too long") ||
    msg.includes("interrupted this request")
  ) {
    return "timeout";
  }

  if (
    code === "AUTH_REQUIRED" ||
    code === "RATE_LIMIT" ||
    code === "FORBIDDEN" ||
    code === "PRO_REQUIRED" ||
    msg.includes("sign in") ||
    msg.includes("upgrade") ||
    msg.includes("daily free limit")
  ) {
    return "auth_pro_required";
  }

  if (
    code === "MODEL_ERROR" ||
    msg.includes("anthropic") ||
    msg.includes("ai service is temporarily busy") ||
    msg.includes("too many requests")
  ) {
    return "model_error";
  }

  if (
    code === "PARSE_VALIDATION" ||
    msg.includes("parse") ||
    msg.includes("unexpected response") ||
    msg.includes("couldn't be generated")
  ) {
    return "parse_validation";
  }

  return "unknown";
}

export function mapHiringReportErrorToUserMessage(payload: {
  error_code?: string;
  message?: string;
}): string {
  const category = classifyHiringReportErrorCode(payload.error_code, payload.message);

  if (category === "auth_pro_required" && payload.message) {
    const msg = payload.message.trim();
    if (msg.length > 0 && msg.length <= 200 && !/[<>{}]/.test(msg)) {
      return msg;
    }
    return "Sign in or upgrade to generate your Hiring Report.";
  }

  return HIRING_REPORT_USER_MESSAGE;
}

/** Strip stack traces and other unsafe fields before any client-visible debug payload. */
export function sanitizeHiringReportErrorDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const { error_stack: _stack, stack: _stack2, ...safe } = details;
  return safe;
}
