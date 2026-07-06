/** Bucket target role labels for observatory breakdown — no PII. */
export function inferResumeQaRoleFamily(targetRole: string): string {
  const role = (targetRole || "").toLowerCase();

  if (/ai|ml|machine learning|llm|data scien/.test(role)) return "ai_ml";
  if (/full[\s-]?stack|software engineer|backend|frontend|devops|platform/.test(role)) {
    return "engineering";
  }
  if (/customer success|csm|account manager|client success/.test(role)) return "customer_success";
  if (/support|help desk|service desk|technical support/.test(role)) return "support";
  if (/operations|ops|supply chain|logistics|integration analyst/.test(role)) return "operations";
  if (/healthcare|clinical|nurse|medical/.test(role)) return "healthcare";
  if (/sales|business development|account executive/.test(role)) return "sales";
  if (/manager|director|lead|head of|vp/.test(role)) return "leadership";

  return "other";
}
