import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const content = data.content?.[0]?.text || "";
      if (content) return content;
      throw new Error("Anthropic returned empty content.");
    }
    const errBody = await res.text();
    console.error("Anthropic error:", res.status, errBody);
    try {
      const parsed = JSON.parse(errBody);
      throw new Error(`Anthropic ${res.status}: ${parsed.error?.message || errBody}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Anthropic")) throw parseErr;
      throw new Error(`Anthropic ${res.status}: ${errBody.slice(0, 300)}`);
    }
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.message.startsWith("Anthropic")) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) throw new Error("Anthropic request timed out after 90s.");
    throw new Error(`AI call failed: ${msg}`);
  }
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

    // Input validation — flexible, never hard-fail on formatting
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      const totalLen = JSON.stringify(body).length;
      if (totalLen < 200) {
        return err(requestId, "INVALID_INPUT", "Please paste your resume text so Signalyz can calibrate your signal.", { roles_provided: 0 });
      }
      // Best-effort: no roles parsed but there's text — let AI handle it
    }

    const totalBullets = (roles || []).reduce((sum: number, r: any) => sum + ((r.bullets || []).length), 0);
    // Flexible validation: accept if ANY of these are true
    const hasEnoughBullets = totalBullets >= 3;
    const hasLongResponsibilities = (roles || []).some((r: any) => (r.bullets || []).some((b: string) => b.length >= 80));
    const hasStructuredRole = (roles || []).some((r: any) => r.company && r.title);
    const experienceValid = hasEnoughBullets || hasLongResponsibilities || hasStructuredRole || totalBullets >= 1;

    if (!experienceValid && (!roles || roles.length === 0)) {
      return err(requestId, "INVALID_INPUT_RESUME_TOO_SHORT", "Paste more of your Experience section for a stronger calibration.", { total_bullets: totalBullets });
    }

    if (!jd || jd.trim().length < 50) {
      return err(requestId, "INVALID_INPUT_JD_TOO_SHORT", "Please paste more of the job description — include responsibilities and requirements for best results.", { jd_len: (jd || "").length });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
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
    // Also track original bullet lengths for post-processing validation
    const originalBulletLengths: number[][] = [];
    const proRolesDescription = professionalRoles.map((r: any, i: number) => {
      const header = [r.company, r.title, r.date_range].filter(Boolean).join(" | ");
      const roleBulletLengths: number[] = [];
      const bulletList = (r.bullets || []).map((b: string, bi: number) => {
        const cleaned = truncate(sanitizeInput(b), 500);
        roleBulletLengths.push(cleaned.length);
        return `  ${bi + 1}. [${cleaned.length} chars] ${cleaned}`;
      }).join("\n");
      originalBulletLengths.push(roleBulletLengths);
      return `PROFESSIONAL ROLE ${i + 1}: ${header || "Untitled Role"}\n${bulletList}`;
    }).join("\n\n");

    const indProjDescription = independentProjects.length > 0 ? independentProjects.map((r: any, i: number) => {
      const header = [r.company, r.title, r.date_range].filter(Boolean).join(" | ");
      const bulletList = (r.bullets || []).map((b: string, bi: number) => `  ${bi + 1}. ${truncate(sanitizeInput(b), 500)}`).join("\n");
      return `INDEPENDENT PROJECT ${i + 1}: ${header || "Project"}\n${bulletList}`;
    }).join("\n\n") : "";

    const prompt = `You are an aggressive professional resume calibration engine. You will receive structured resume roles with individual bullets, plus a target job description. Your job is to MAXIMALLY reposition the candidate's language to mirror the target role while preserving factual accuracy.

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
   - CRITICAL SUMMARY CALIBRATION: The summary MUST mirror the vocabulary, tone, and seniority framing of the target JD. Extract 3-5 key phrases from the JD (e.g., "operational excellence", "stakeholder engagement", "P&L ownership") and weave them naturally into the summary where they honestly reflect the candidate's experience. The summary should read as if the candidate wrote it specifically for THIS role.
3. For EACH role, calibrate EACH bullet individually. Preserve the original role structure — do NOT merge bullets across roles.
4. Generate an INTERVIEW PREPARATION NOTICE (2-3 sentences identifying remaining perception gaps after calibration).

═══ SCORING SYSTEM AWARENESS ═══
The calibrated output will be scored by an automated signal engine that measures EXACT dimensions. Your calibration MUST target these specific measurable signals:

SIGNAL 1 — OWNERSHIP DENSITY: The scorer counts these EXACT verbs at the START of each bullet: led, drove, owned, spearheaded, architected, orchestrated, directed, launched, built, scaled, implemented, executed, transformed, championed, governed, delivered, established, redesigned, pioneered, devised, instituted, restructured, consolidated, mobilized, accelerated, elevated, oversaw, administered, standardized, created, developed, designed, automated, negotiated, facilitated, optimized, revamped, formulated, engineered, deployed, maintained, resolved, streamlined, trained, mentored, supervised. EVERY bullet MUST start with one of these EXACT verbs. The scorer gives ZERO credit for bullets starting with any other word.

SIGNAL 2 — JD KEYWORD COVERAGE: The scorer extracts the top 15 most frequent 4+ letter non-stop-words from the JD and checks if they appear IN THE BULLET TEXT (not in skills or headers). You MUST embed as many of these JD-specific terms as possible DIRECTLY INTO bullet sentences. Generic words don't count — only distinctive JD vocabulary matters.

SIGNAL 3 — OUTCOME/IMPACT TERMS: The scorer checks for these EXACT terms in each bullet: increased, reduced, improved, grew, saved, delivered, achieved, exceeded, decreased, boosted, lowered, raised, generated, optimized, reducing, improving, streamlined, standardizing, minimized, eliminated, enhancing, resulting in, leading to, which led to, driving, enabling. EVERY bullet must contain at least one of these outcome terms.

SIGNAL 4 — PASSIVE LANGUAGE: The scorer PENALIZES these exact phrases: helped, assisted, supported, participated in, was involved, tasked with. NEVER use any of these phrases anywhere in the output.

SIGNAL 5 — SCOPE INDICATORS: The scorer gives bonus credit for scope signals: dollar amounts ($), percentages (%), team/people counts, cross-functional, end-to-end, enterprise-wide, global, regional, multi-site, high-volume, portfolio, program, p&l, budget, revenue, governance. Include as many HONEST scope indicators as possible.

═══ END SCORING AWARENESS ═══

BULLET CALIBRATION RULES (CRITICAL — ABSOLUTE CONSTRAINTS):
Each original bullet has its character count shown as [N chars]. Your calibrated version MUST meet or exceed that character count.

RULE 1 — OWNERSHIP VERB MANDATE:
Every single calibrated bullet MUST open with one of the EXACT verbs from Signal 1 above. No exceptions. The FIRST WORD of every bullet must be from that list.
- BANNED openers: "Assisted with", "Helped", "Was responsible for", "Participated in", "Involved in", "Contributed to", "Worked on", "Supported", "Played a role in", "Tasked with", "Responsible for", "Utilized", "Leveraged", "Ensured", "Focused on", "Served as"
- If the original bullet starts with a weak/passive construction, REPLACE the opener entirely with the strongest accurate ownership verb from Signal 1. The candidate did the work — frame it that way.
- VARY your verb choices across bullets. Do not repeat the same verb more than twice across the entire resume.

RULE 2 — JD VOCABULARY MIRRORING (MANDATORY):
You MUST integrate JD-specific vocabulary into at least 4 bullets PER ROLE. This is non-negotiable.
- Read the JD carefully and extract the top 8-10 distinctive multi-word phrases (not generic words like "team" or "work", but specific operational language like "cross-functional collaboration", "revenue optimization", "client lifecycle management", "regulatory compliance", "SLA adherence").
- Also extract the top 10-15 distinctive single words (4+ letters) that appear frequently in the JD — these are the EXACT keywords the scorer will look for.
- For each role, weave these JD terms DIRECTLY INTO the bullet text as natural extensions of what the candidate actually did.
- Example: If JD says "drive operational efficiency" and the original bullet says "Improved processes to reduce wait times" → calibrate to "Drove operational efficiency by redesigning queue management processes, reducing average wait times by 30% across all service channels."
- The mirrored vocabulary must feel organic, not forced. Integrate it as context, scope, or outcome framing.

RULE 3 — OUTCOME/IMPACT MANDATE:
Every single calibrated bullet MUST contain at least one outcome term from Signal 3 above. No bullet may end with just an action description.
- If the original has a metric → preserve it verbatim and ADD outcome framing context (e.g., "15% reduction" → "reduced resolution time by 15%, directly improving customer retention metrics").
- If the original lacks a metric → add the closest HONEST scope/outcome signal:
  * Scale: team size, number of accounts, volume of transactions, geographic scope
  * Stakeholders: who benefited (internal teams, clients, executives, end users)
  * Operational effect: "reducing manual effort", "enabling the team to handle increased volume", "eliminating compliance gaps"
  * Business framing: "driving department-wide cost savings", "improving quarterly performance", "achieving consistent SLA compliance"
- NEVER fabricate specific numbers. Use honest contextual framing: "across multiple departments", "for a portfolio of enterprise accounts", "within a high-volume operational environment".

RULE 4 — PASSIVE ELIMINATION (MANDATORY):
Scan every bullet for ANY of these phrases: helped, assisted, supported, participated in, was involved, tasked with. If found, REPLACE the entire construction with an active ownership framing. The candidate OWNED the work — frame it accordingly.
- "Helped implement" → "Implemented"
- "Assisted in managing" → "Managed"  
- "Supported the development of" → "Developed"
- "Was involved in" → "Directed" / "Executed"
- "Participated in" → "Led" / "Drove"
- "Tasked with" → "Owned" / "Executed"

ADDITIVE CALIBRATION — never subtractive:
- START with the original bullet content as your base. Keep every word of substance.
- LAYER ON TOP: ownership verbs from Signal 1, JD keywords from Signal 2, outcome terms from Signal 3, and scope indicators from Signal 5.
- You MUST preserve EVERY specific detail — stakeholder names, volume metrics, process outcomes, tool names, team sizes, dollar amounts.
- Do NOT summarize, condense, or rephrase into fewer words. EXPAND and STRENGTHEN.
- If the original says "Managed a team of 12 customer service representatives handling 500+ daily inquiries across phone and email channels" — your output must contain ALL of those details PLUS additional alignment language.
- If the original already contains strong outcome framing or scope metrics, PRESERVE them and ADD more context around them.

LENGTH ENFORCEMENT:
- The calibrated bullet MUST be at least 20% LONGER than the original. This is non-negotiable.
- If the original is 80 characters, your calibrated version must be at least 96 characters.
- If the original is 150 characters, your calibrated version must be at least 180 characters.
- The additional length comes from: ownership verb upgrades, JD vocabulary integration, outcome/impact framing, and scope indicators.
- If a calibrated bullet exceeds 4 lines (~280 characters), split into two bullets. The second begins with "Additionally," "Further," or "Concurrently,".

CALIBRATION INTENSITY — aim for MAXIMUM signal differentiation:
- Do NOT produce bullets that are minor word-swaps of the original. Every bullet must be substantially restructured to maximize scoring signals.
- The calibrated version should feel like a senior professional rewrote their resume specifically for this target role.
- Restructure sentence flow: LEAD with a Signal 1 ownership verb, EMBED Signal 2 JD keywords in the middle, END with a Signal 3 outcome term and Signal 5 scope indicator.
- Example of INSUFFICIENT calibration: "Managed customer complaints" → "Managed and resolved customer complaints" (too similar, no JD keywords, no outcome term)
- Example of SUFFICIENT calibration: "Managed customer complaints" → "Directed end-to-end resolution of escalated customer complaints across a multi-channel support environment, implementing root-cause analysis protocols that reduced repeat contact rates and improved first-call resolution metrics for a portfolio of enterprise accounts"

PRO FILTER (ZERO FABRICATION):
- Never fabricate skills, metrics, tools, certifications, or responsibilities not present in the original.
- Never invent specific numbers — use contextual framing instead ("significant", "across multiple", "enterprise-scale").
- Lead with evidence before claims — numbers, systems, ownership, outcomes first.
- Use operational language: what was built, owned, fixed, decided.
- Never use: "results-driven", "leveraging synergies", "passionate about", "dynamic environment", "fast-paced team", "proven track record".
- Vary sentence cadence — no symmetrical bullet structures.
- Write like a capable professional explaining work to a peer who speaks the JD's language.

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
  "positioning_statement": "string (3-4 sentence professional summary, heavily mirroring JD vocabulary)",
  "interview_preparation_notice": "string (2-3 sentences on remaining gaps)",
  "calibrated_professional_roles": [
    {
      "company": "string",
      "title": "string",
      "date_range": "string",
      "calibrated_bullets": ["string (each bullet individually calibrated, LONGER than original, with ownership verb + JD mirroring + outcome)"]
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
- Every calibrated bullet must be at least 20% LONGER than its original. Never compress.
- Every bullet MUST start with an ownership verb from Signal 1. No exceptions. The FIRST WORD must be from that exact list.
- At least 4 bullets per role MUST contain JD-mirrored vocabulary embedded directly in the bullet text.
- Every bullet MUST contain at least one outcome term from Signal 3.
- ZERO passive phrases from Signal 4 anywhere in the output.
- Every bullet MUST contain an outcome, impact, or scope indicator.`;

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

    // Post-processing: validate calibrated bullets are not shorter than originals
    // If any bullet was trimmed by the AI, restore the original and append alignment framing
    for (let ri = 0; ri < calibrated_roles.length && ri < professionalRoles.length; ri++) {
      const origBullets = professionalRoles[ri]?.bullets || [];
      const calBullets = calibrated_roles[ri]?.calibrated_bullets || [];
      for (let bi = 0; bi < calBullets.length && bi < origBullets.length; bi++) {
        const origLen = sanitizeInput(origBullets[bi] || "").trim().length;
        const calLen = (calBullets[bi] || "").trim().length;
        if (origLen > 0 && calLen < origLen * 0.85) {
          // Bullet was trimmed — restore original content with calibrated language appended
          console.warn(JSON.stringify({
            request_id: requestId,
            warning: "BULLET_TRIMMED_BY_AI",
            role_index: ri,
            bullet_index: bi,
            original_len: origLen,
            calibrated_len: calLen,
          }));
          // Use the calibrated version as an addendum to the original
          const origText = sanitizeInput(origBullets[bi]).trim();
          const calText = (calBullets[bi] || "").trim();
          // If calibrated text is substantially different, merge; otherwise just use original
          if (calText && calText.length > 20) {
            calBullets[bi] = `${origText} — ${calText}`;
          } else {
            calBullets[bi] = origText;
          }
        }
      }
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
