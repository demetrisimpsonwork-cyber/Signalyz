import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-5-mini",
];

function makeRequestId(): string {
  return crypto.randomUUID();
}

function ok(body: Record<string, unknown>, requestId: string) {
  return new Response(JSON.stringify({ status: "success", request_id: requestId, ...body }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(requestId: string, errorCode: string, message: string, details?: Record<string, unknown>) {
  return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: errorCode, message, details }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAI(apiKey: string, prompt: string): Promise<string> {
  for (const model of MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (content) return content;
      }
    } catch (e) {
      clearTimeout(timeout);
      console.error(`${model} error:`, e);
    }
  }
  throw new Error("All AI models failed or timed out.");
}

function sanitizeInput(input: string): string {
  return input
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/you\s+are\s+now\s+/gi, "")
    .replace(/act\s+as\s+/gi, "")
    .replace(/pretend\s+(you\s+are|to\s+be)\s+/gi, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[ \t]{3,}/g, "  ")
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = makeRequestId();

  try {
    const body = await req.json();
    const { roles, jd, matchScore, existingSummary, skills, certifications } = body;

    // Structured logging
    const rolesLen = JSON.stringify(roles || []).length;
    const jdLen = (jd || "").length;
    console.log(JSON.stringify({
      request_id: requestId,
      function: "generate-resume-summary",
      timestamp: new Date().toISOString(),
      roles_count: Array.isArray(roles) ? roles.length : 0,
      roles_payload_len: rolesLen,
      jd_len: jdLen,
      total_payload_len: rolesLen + jdLen,
      has_existing_summary: !!existingSummary,
      has_skills: !!skills,
    }));

    // Input validation
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return err(requestId, "INVALID_INPUT", "Please paste your experience bullets so Resumix can calibrate your resume.", { roles_provided: 0 });
    }

    const totalBullets = roles.reduce((sum: number, r: any) => sum + ((r.bullets || []).length), 0);
    if (totalBullets < 2) {
      return err(requestId, "INVALID_INPUT_RESUME_TOO_SHORT", "Your resume needs at least a few experience bullets for calibration. Paste more of your Experience section.", { total_bullets: totalBullets });
    }

    if (!jd || jd.trim().length < 100) {
      return err(requestId, "INVALID_INPUT_JD_TOO_SHORT", "Please paste more of the job description — include responsibilities and requirements for best results.", { jd_len: (jd || "").length });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return err(requestId, "CONFIG_ERROR", "Analysis engine configuration error. Please try again later.");
    }

    // Truncate JD to 8k chars
    const cleanJd = truncate(sanitizeInput(jd), 8000);

    // Categorize roles
    const professionalRoles: typeof roles = [];
    const independentProjects: typeof roles = [];

    for (const r of roles) {
      const company = (r.company || "").toLowerCase();
      const title = (r.title || "").toLowerCase();
      const dateRange = (r.date_range || "").toLowerCase();
      const hasEmployer = company && !["experience", "untitled role", ""].includes(company);
      const isIndependent = company.includes("independent") || company.includes("personal") ||
        company.includes("self") || company.includes("freelance") ||
        title.includes("founder") || title.includes("creator") ||
        title.includes("personal project") || title.includes("side project") ||
        (!hasEmployer && !dateRange);

      if (isIndependent) {
        independentProjects.push(r);
      } else {
        professionalRoles.push(r);
      }
    }

    // Build roles description — truncate individual bullets to prevent blowup
    const proRolesDescription = professionalRoles.map((r: any, i: number) => {
      const header = [r.company, r.title, r.date_range].filter(Boolean).join(" | ");
      const bulletList = (r.bullets || []).map((b: string, bi: number) => `  ${bi + 1}. ${truncate(sanitizeInput(b), 500)}`).join("\n");
      return `PROFESSIONAL ROLE ${i + 1}: ${header || "Untitled Role"}\n${bulletList}`;
    }).join("\n\n");

    const indProjDescription = independentProjects.length > 0 ? independentProjects.map((r: any, i: number) => {
      const header = [r.company, r.title, r.date_range].filter(Boolean).join(" | ");
      const bulletList = (r.bullets || []).map((b: string, bi: number) => `  ${bi + 1}. ${truncate(sanitizeInput(b), 500)}`).join("\n");
      return `INDEPENDENT PROJECT ${i + 1}: ${header || "Project"}\n${bulletList}`;
    }).join("\n\n") : "";

    const prompt = `You are a professional resume calibration engine. You will receive structured resume roles with individual bullets, plus a target job description.

Address the user directly in second person throughout all output. Use 'you' and 'your' exclusively. Never use the candidate's name or third-person pronouns (he/his/she/her/they/their) when referring to the candidate or their experience. The product speaks to the user, never about them.

YOUR TASK:
1. Infer the target role title and seniority from the JD.
2. Generate a calibrated PROFESSIONAL SUMMARY following these strict rules:
   - Maximum 4 sentences.
   - Open with a declarative identity statement: state the identity directly without "I am" — e.g. "Client experience operations professional with 7+ years..." NOT "I am a highly accomplished..."
   - Every sentence must start with an active verb or a specific noun — never a passive construction.
   - Must reference the specific role being targeted — not a generic summary.
   - Must include at least one specific measurable detail from the resume.
   - NEVER open a sentence with: "Demonstrates", "Possesses", "reflecting", "Highly accomplished", "Dedicated experience".
   - Replace passive constructions with active ownership language.
   - First person present tense for the summary.
3. For EACH role, calibrate EACH bullet individually. Preserve the original role structure — do NOT merge bullets across roles.
4. Generate an INTERVIEW PREPARATION NOTICE (2-3 sentences identifying remaining perception gaps after calibration).

BULLET CALIBRATION RULES (CRITICAL):
- Reposition each bullet to align with the target JD's priority signals.
- You MUST preserve EVERY specific detail from the original bullet — stakeholder names, volume metrics, process outcomes, tool names.
- Do NOT remove any detail that exists in the original.
- ADD JD-aligned language, stronger ownership framing, and role-native vocabulary ON TOP of what already exists.
- The calibrated bullet must ALWAYS be equal to or LONGER than the original bullet.
- If the original bullet is already well-aligned, elevate the language while keeping ALL specifics intact.
- NEVER produce a bullet that loses detail the original contained.
- If a calibrated bullet exceeds 4 lines of text (~280 characters), split it into two bullets. The second bullet should begin with a continuation verb ("Additionally," "Further," "Concurrently,").

PINNACLE FILTER:
- Never fabricate skills, metrics, tools, certifications, or responsibilities not present in the original.
- Lead with evidence before claims — numbers, systems, ownership, outcomes first.
- Use operational language: what was built, owned, fixed, decided.
- Never use: "results-driven", "leveraging synergies", "passionate about", "dynamic environment", "fast-paced team".
- Vary sentence cadence — no symmetrical bullet structures.
- Write like a capable professional explaining work to a peer.

INPUTS:
${proRolesDescription}

${indProjDescription ? `\n${indProjDescription}` : ""}

${existingSummary ? `EXISTING SUMMARY: ${truncate(sanitizeInput(existingSummary), 2000)}` : ""}
${skills ? `SKILLS/COMPETENCIES: ${truncate(sanitizeInput(skills), 2000)}` : ""}
${certifications ? `CERTIFICATIONS: ${truncate(sanitizeInput(certifications), 1000)}` : ""}

JOB DESCRIPTION: ${cleanJd}

MATCH SCORE: ${matchScore || "N/A"}%

Return ONLY this JSON (no markdown, no code fences):
{
  "positioning_statement": "string (3-4 sentence professional summary)",
  "interview_preparation_notice": "string (2-3 sentences on remaining gaps)",
  "calibrated_professional_roles": [
    {
      "company": "string",
      "title": "string",
      "date_range": "string",
      "calibrated_bullets": ["string (each bullet individually calibrated, LONGER than original)"]
    }
  ],
  "calibrated_independent_projects": [
    {
      "company": "string",
      "title": "string",
      "date_range": "string",
      "calibrated_bullets": ["string"]
    }
  ]
}

CRITICAL: 
- calibrated_professional_roles must have the SAME number of roles as the professional input roles, in the SAME order. Each role must have the SAME number of bullets.
- calibrated_independent_projects must have the SAME number as independent project inputs.
- Every calibrated bullet must be EQUAL TO OR LONGER than its original. Never compress.`;

    let content = await callAI(apiKey, prompt);
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error(JSON.stringify({ request_id: requestId, error: "JSON_PARSE_FAILED", snippet: content.slice(0, 500) }));
      return err(requestId, "AI_PARSE_ERROR", "The analysis engine returned an unparseable response. Please retry.", { response_snippet: content.slice(0, 300) });
    }

    if (!parsed.positioning_statement) {
      return err(requestId, "AI_INVALID_STRUCTURE", "The analysis engine returned an incomplete response. Please retry.");
    }

    const calibrated_roles = [
      ...(parsed.calibrated_professional_roles || parsed.calibrated_roles || []),
    ];
    const independent_projects = parsed.calibrated_independent_projects || [];

    // Null-safe: ensure every role has calibrated_bullets array
    for (const role of calibrated_roles) {
      if (!Array.isArray(role.calibrated_bullets)) role.calibrated_bullets = [];
      role.company = role.company || "";
      role.title = role.title || "";
      role.date_range = role.date_range || "";
    }
    for (const proj of independent_projects) {
      if (!Array.isArray(proj.calibrated_bullets)) proj.calibrated_bullets = [];
      proj.company = proj.company || "";
      proj.title = proj.title || "";
      proj.date_range = proj.date_range || "";
    }

    console.log(JSON.stringify({ request_id: requestId, status: "success", roles_returned: calibrated_roles.length, projects_returned: independent_projects.length }));

    return ok({
      positioning_statement: parsed.positioning_statement,
      interview_preparation_notice: parsed.interview_preparation_notice || "",
      calibrated_roles,
      independent_projects,
    }, requestId);

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(JSON.stringify({ request_id: requestId, error: "EDGE_EXCEPTION", message, stack: (stack || "").slice(0, 500) }));
    return err(requestId, "EDGE_EXCEPTION", "Resume calibration engine temporarily unavailable. Please retry.", { error_message: message });
  }
});
