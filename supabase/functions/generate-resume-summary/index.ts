import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ANTHROPIC_SONNET_MODEL } from "../_shared/anthropicModel.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function makeRequestId(): string {
  return crypto.randomUUID();
}

function err(
  requestId: string,
  errorCode: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return new Response(
    JSON.stringify({
      status: "error",
      request_id: requestId,
      error_code: errorCode,
      message,
      ...(details ? { details } : {}),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function ok(payload: Record<string, unknown>, requestId: string) {
  return new Response(
    JSON.stringify({
      status: "success",
      request_id: requestId,
      ...payload,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

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
        model: ANTHROPIC_SONNET_MODEL,
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

SIGNAL 1 — OWNERSHIP DENSITY: The scorer counts these EXACT verbs at the START of each bullet: led, drove, owned, architected, directed, launched, built, scaled, implemented, executed, transformed, governed, delivered, established, redesigned, devised, instituted, restructured, consolidated, accelerated, elevated, oversaw, administered, standardized, created, developed, designed, automated, negotiated, facilitated, optimized, revamped, formulated, engineered, deployed, maintained, resolved, streamlined, trained, mentored, supervised. EVERY bullet MUST start with one of these EXACT verbs. The scorer gives ZERO credit for bullets starting with any other word.
BANNED VERBS (NEVER USE ANYWHERE): leveraged, spearheaded, championed, pioneered, mobilized, orchestrated. These are flagged as inflated AI signal language. Use direct alternatives: led, directed, built, drove, managed, coordinated.

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

RULE 3 — OUTCOME/IMPACT HANDLING:
Bullets SHOULD contain outcome framing when possible, but NEVER use generic filler phrases.
- If the original has a metric → preserve it verbatim and ADD outcome framing context (e.g., "15% reduction" → "reduced resolution time by 15%, directly improving customer retention metrics").
- If the original lacks a metric → infer a CONTEXT-AWARE outcome that logically follows from the action described:
  * "Reviewed monthly reports" → "Reviewed monthly reports to ensure accuracy and completeness"
  * "Coordinated with vendors" → "Coordinated with vendors to align delivery timelines with project milestones"
  * The outcome MUST be logically derivable from the bullet content — not a generic phrase bolted on.
- NEVER append these generic filler phrases: "improved efficiency", "enhanced productivity", "streamlined operations", "driving results", "boosting performance", "ensuring success", "optimizing workflows", "delivering value", "achieving operational excellence".
- If NO context-aware outcome can be honestly inferred from the bullet, LEAVE THE BULLET UNCHANGED rather than appending filler.
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

    // ═══ POST-PROCESSING: Signal-Aware Bullet Validation & Repair ═══

    const OWNERSHIP_VERBS = new Set([
      "led","drove","owned","architected","directed","launched",
      "built","scaled","implemented","executed","transformed","governed","delivered",
      "established","redesigned","devised","instituted","restructured","consolidated",
      "accelerated","elevated","oversaw","administered","standardized","created",
      "developed","designed","automated","negotiated","facilitated","optimized","revamped",
      "formulated","engineered","deployed","maintained","resolved","streamlined","trained",
      "mentored","supervised",
    ]);

    const BANNED_VERBS_SET = new Set(["leveraged","spearheaded","championed","pioneered","mobilized","orchestrated"]);
    const BANNED_VERB_REPLACEMENTS: Record<string,string> = {
      "leveraged":"used", "spearheaded":"led", "championed":"drove",
      "pioneered":"built", "mobilized":"coordinated", "orchestrated":"coordinated",
    };

    const OUTCOME_TERMS = new Set([
      "increased","reduced","improved","grew","saved","delivered","achieved","exceeded",
      "decreased","boosted","lowered","raised","generated","optimized","reducing","improving",
      "streamlined","standardizing","minimized","eliminated","enhancing","resulting in",
      "leading to","driving","enabling",
    ]);

    const PASSIVE_PHRASES = ["helped","assisted","supported","participated in","was involved","tasked with"];

    // Extract top JD keywords for post-processing keyword injection
    const jdWords = cleanJd.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w => w.length >= 4);
    const jdFreq: Record<string,number> = {};
    const STOP = new Set(["with","from","that","this","they","their","have","will","been","were","your","about","also","more","than","each","into","only","when","what","some","other","would","could","should","these","those","being","which","after","through","between","under","during","before","where","most"]);
    for (const w of jdWords) { if (!STOP.has(w)) jdFreq[w] = (jdFreq[w] || 0) + 1; }
    const topJdKeywords = Object.entries(jdFreq).sort((a,b) => b[1]-a[1]).slice(0, 15).map(e => e[0]);

    let repairCount = 0;

    for (let ri = 0; ri < calibrated_roles.length && ri < professionalRoles.length; ri++) {
      const origBullets = professionalRoles[ri]?.bullets || [];
      const calBullets = calibrated_roles[ri]?.calibrated_bullets || [];

      for (let bi = 0; bi < calBullets.length && bi < origBullets.length; bi++) {
        const origText = sanitizeInput(origBullets[bi] || "").trim();
        let bullet = (calBullets[bi] || "").trim();
        const origLen = origText.length;

        // REPAIR 1: Length — bullet must not be shorter than 85% of original
        if (origLen > 0 && bullet.length < origLen * 0.85) {
          console.warn(JSON.stringify({ request_id: requestId, warning: "BULLET_TRIMMED", role: ri, bullet: bi, origLen, calLen: bullet.length }));
          if (bullet.length > 20) {
            bullet = `${origText} — ${bullet}`;
          } else {
            bullet = origText;
          }
          repairCount++;
        }

        // REPAIR 2: Ownership verb lead — first word must be from the approved set
        const firstWord = bullet.split(/\s/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
        if (!OWNERSHIP_VERBS.has(firstWord)) {
          // Remove passive openers and prepend ownership verb
          let cleaned = bullet;
          for (const p of PASSIVE_PHRASES) {
            const re = new RegExp(`^${p}\\s*(with\\s+|in\\s+|the\\s+)?`, "i");
            if (re.test(cleaned)) { cleaned = cleaned.replace(re, ""); break; }
          }
          // Also strip "Responsible for", "Utilized", "Leveraged", "Ensured", "Focused on", "Served as"
          cleaned = cleaned.replace(/^(responsible\s+for|utilized|leveraged|ensured|focused\s+on|served\s+as|contributed\s+to|worked\s+on|played\s+a\s+role\s+in)\s*/i, "");

          // Check if cleaned text already starts with an ownership verb — use it directly
          const cleanedFirst = cleaned.split(/\s/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
          if (OWNERSHIP_VERBS.has(cleanedFirst)) {
            bullet = cleaned;
            repairCount++;
          } else {
            // Check if cleaned starts with ANY common verb — replace it instead of prepending
            const isVerbLike = /^[a-z]+(ed|ing|ate|ize|ify|ise)$/i.test(cleanedFirst) && cleanedFirst.length >= 4;
            const COMMON_VERBS = new Set(["execute","serve","handle","engage","provide","ensure","focus","utilize","leverage","apply","address","assess","manage","coordinate","monitor","track","plan","produce","communicate","oversee","participate","perform","present","identify","evaluate","operate","report","document","prepare","process","compile","organize","conduct","review"]);
            if (isVerbLike || COMMON_VERBS.has(cleanedFirst)) {
              // Replace the existing verb with a contextual ownership verb
              cleaned = cleaned.replace(/^\S+\s*/, "");
            }

            // Pick a contextual verb based on bullet content
            const lc = cleaned.toLowerCase();
            let verb = "Executed";
            if (/team|staff|report|direct/i.test(lc)) verb = "Directed";
            else if (/develop|build|creat|design/i.test(lc)) verb = "Developed";
            else if (/improv|optimi|efficien|reduc/i.test(lc)) verb = "Optimized";
            else if (/manag|oversee|supervis|coordinat/i.test(lc)) verb = "Managed";
            else if (/implement|deploy|launch|roll/i.test(lc)) verb = "Implemented";
            else if (/analy|assess|evaluat|review/i.test(lc)) verb = "Analyzed";
            else if (/establish|set up|initiat|found/i.test(lc)) verb = "Established";
            else if (/train|mentor|coach|onboard/i.test(lc)) verb = "Trained";
            else if (/automat|script|program|integrat/i.test(lc)) verb = "Automated";
            else if (/resolv|troubleshoot|fix|debug/i.test(lc)) verb = "Resolved";
            // Capitalize first letter of remaining text
            const remainder = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
            bullet = `${verb} ${remainder}`;
            repairCount++;
          }
        }

        // REPAIR 3: Passive language removal
        for (const p of PASSIVE_PHRASES) {
          const re = new RegExp(`\\b${p}\\b`, "gi");
          if (re.test(bullet)) {
            bullet = bullet.replace(re, (match) => {
              const map: Record<string,string> = { "helped":"drove", "assisted":"managed", "supported":"delivered", "participated in":"led", "was involved":"directed", "tasked with":"owned" };
              return map[match.toLowerCase()] || "executed";
            });
            repairCount++;
          }
        }

        // REPAIR 4: Outcome term presence — leave bullet unchanged if no real outcome can be inferred
        // (Previously appended generic filler; now we trust the AI's output or leave as-is)

        // REPAIR 5: JD keyword presence — leave bullet unchanged if keywords aren't naturally present
        // (Previously appended hollow "aligned with X objectives" suffix; removed to prevent detectable keyword stuffing)

        // REPAIR 6: Banned verb replacement — catch any banned verbs that slipped through
        const bulletFirstWord = bullet.split(/\s/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
        if (BANNED_VERBS_SET.has(bulletFirstWord)) {
          const replacement = BANNED_VERB_REPLACEMENTS[bulletFirstWord] || "led";
          bullet = replacement.charAt(0).toUpperCase() + replacement.slice(1) + bullet.slice(bullet.indexOf(" "));
          repairCount++;
        }
        // Also catch banned verbs mid-sentence
        for (const [banned, safe] of Object.entries(BANNED_VERB_REPLACEMENTS)) {
          const re = new RegExp(`\\b${banned}\\b`, "gi");
          if (re.test(bullet)) {
            bullet = bullet.replace(re, safe);
            repairCount++;
          }
        }

        calBullets[bi] = bullet;
      }
    }

    if (repairCount > 0) {
      console.log(JSON.stringify({ request_id: requestId, post_processing: "signal_repairs_applied", repair_count: repairCount }));
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
