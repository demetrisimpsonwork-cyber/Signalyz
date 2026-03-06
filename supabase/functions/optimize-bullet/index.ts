import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_FREE_LIMIT = 3;

// ─── Input limits ────────────────────────────────────────────────────────────
const MAX_RESUME_CHARS = 10000;
const MAX_JD_CHARS = 8000;
const MAX_COMBINED_CHARS = 16000;
const MIN_RESUME_CHARS = 20;
const MIN_JD_CHARS = 20;

const DETERMINISTIC_SYSTEM = `You are a deterministic analysis engine. Your outputs must be perfectly reproducible.

EXTRACTION RULES:
- Extract the same priority signals every time for the same input. Your extraction must be reproducible.
- List signals in consistent priority order based on frequency and emphasis in the source text.
- Extract the same experience signals every time for the same input. Do not vary which signals you surface based on phrasing flexibility.
- When identifying keywords, scan the full text systematically from top to bottom. Do not skip or reorder based on salience impressions.

SCORING RULES:
- You are a deterministic scorer. The inputs you are scoring were extracted deterministically. You must return the same score for the same inputs every time.
- Anchor to your first assessment and do not vary it.
- If you are uncertain between two values, anchor to the lower bound and hold it.
- Use explicit evidence counting, not subjective impression, for every numeric field.

OUTPUT RULES:
- Return only valid JSON. No markdown, no code fences, no preamble, no explanation.
- Start your response with { and end with }.`;

async function callAI(apiKey: string, prompt: string, maxTokens = 3500, extraSystemNote?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const systemContent = extraSystemNote
      ? `${DETERMINISTIC_SYSTEM}\n\n${extraSystemNote}`
      : DETERMINISTIC_SYSTEM;
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        temperature: 0,
        system: systemContent,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timeout);
    console.log("Anthropic status:", aiRes.status);
    if (aiRes.ok) {
      const data = await aiRes.json();
      const content = data.content?.[0]?.text || "";
      if (content) return content;
      throw new Error("Anthropic returned empty content.");
    }
    const errBody = await aiRes.text();
    console.error("Anthropic error:", aiRes.status, errBody);
    try {
      const parsed = JSON.parse(errBody);
      throw new Error(`Anthropic ${aiRes.status}: ${parsed.error?.message || errBody}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Anthropic")) throw parseErr;
      throw new Error(`Anthropic ${aiRes.status}: ${errBody.slice(0, 300)}`);
    }
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.message.startsWith("Anthropic")) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) throw new Error("Anthropic request timed out after 90s.");
    throw new Error(`AI call failed: ${msg}`);
  }
}

function extractJSON(raw: string): Record<string, unknown> {
  // Strip markdown code fences
  let stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Try direct parse first
  try {
    return JSON.parse(stripped);
  } catch { /* fall through */ }

  // Find outermost { ... } 
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response");
  }

  return JSON.parse(stripped.slice(start, end + 1));
}

// ─── Input normalization ─────────────────────────────────────────────────────

function normalizeText(input: string): string {
  return input
    // Remove null bytes and unusual control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Collapse repeated whitespace (preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripResumeHeader(text: string): string {
  const lines = text.split("\n");
  let skipUntil = 0;
  // Heuristic: skip leading lines that look like name/email/phone/address (up to 6 lines)
  const headerPatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,                    // "John Smith"
    /\b[\w.-]+@[\w.-]+\.\w{2,}\b/,                     // email
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,            // phone
    /^\d+\s+\w+\s+(street|st|ave|avenue|blvd|rd|dr)/i, // address
    /^(linkedin|github|portfolio)/i,                    // social links
    /^(http|www\.)/i,                                   // URLs
  ];
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (!line) { skipUntil = i + 1; continue; }
    if (headerPatterns.some(p => p.test(line))) { skipUntil = i + 1; continue; }
    break;
  }
  return skipUntil > 0 ? lines.slice(skipUntil).join("\n").trim() : text;
}

function enforceCharLimits(resume: string, jd: string): { resume: string; jd: string; truncated: boolean } {
  let truncated = false;
  if (resume.length > MAX_RESUME_CHARS) { resume = resume.slice(0, MAX_RESUME_CHARS); truncated = true; }
  if (jd.length > MAX_JD_CHARS) { jd = jd.slice(0, MAX_JD_CHARS); truncated = true; }
  const combined = resume.length + jd.length;
  if (combined > MAX_COMBINED_CHARS) {
    const excess = combined - MAX_COMBINED_CHARS;
    resume = resume.slice(0, resume.length - excess);
    truncated = true;
  }
  return { resume, jd, truncated };
}

function sanitizeInput(input: string): string {
  return input
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/you\s+are\s+now\s+/gi, "")
    .replace(/act\s+as\s+/gi, "")
    .replace(/pretend\s+(you\s+are|to\s+be)\s+/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

// ─── In-memory result cache (SHA-256, 30min TTL, 50 entries) ──────────────────
const resultCache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 50;

async function hashInputs(a: string, b: string, mode: string): Promise<string> {
  const enc = new TextEncoder().encode(a + "|" + b + "|" + mode);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { resultCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>) {
  if (resultCache.size >= CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(key, { data, ts: Date.now() });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const { bullet, jd, userId, mode = "single_bullet", sessionToken } = await req.json();
    const userPlan = mode === "multi_bullet" ? "pro" : "free";

    // --- Structured logging ---
    console.log(JSON.stringify({
      event: "request_start",
      request_id: requestId,
      function: "optimize-bullet",
      timestamp: new Date().toISOString(),
      resume_text_length: typeof bullet === "string" ? bullet.length : 0,
      jd_text_length: typeof jd === "string" ? jd.length : 0,
      total_payload_length: (typeof bullet === "string" ? bullet.length : 0) + (typeof jd === "string" ? jd.length : 0),
      user_plan: userPlan,
    }));

    // --- Input validation (always 200) ---
    if (!bullet || typeof bullet !== "string" || !jd || typeof jd !== "string") {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INVALID_INPUT", message: "Missing or invalid resume or job description fields." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedBullet = bullet.trim();
    const trimmedJd = jd.trim();

    if (trimmedBullet.length < 20) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Experience input must be at least 20 characters." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (trimmedJd.length < 20) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Job description must be at least 20 characters." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Normalize and enforce limits ---
    let normalizedBullet = normalizeText(stripResumeHeader(trimmedBullet));
    let normalizedJd = normalizeText(trimmedJd);
    const limits = enforceCharLimits(normalizedBullet, normalizedJd);
    normalizedBullet = limits.resume;
    normalizedJd = limits.jd;

    const cleanBullet = sanitizeInput(normalizedBullet);
    const cleanJd = sanitizeInput(normalizedJd);

    if (cleanBullet.length < MIN_RESUME_CHARS) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Please paste more of your Experience section so Resumix can analyze your signal.", details: { resume_len: cleanBullet.length, jd_len: cleanJd.length } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (cleanJd.length < MIN_JD_CHARS) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Please paste the job description responsibilities and requirements so Resumix can calibrate your signal.", details: { resume_len: cleanBullet.length, jd_len: cleanJd.length } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Cache check ───────────────────────────────────────────────────────
    const cacheKey = await hashInputs(cleanBullet, cleanJd, userPlan);
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("Cache HIT for", cacheKey.slice(0, 12));
      return new Response(JSON.stringify({ status: "success", request_id: requestId, cached: true, ...cached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // --- Server-side rate limiting for free users ---
    if (userPlan === "free") {
      const today = new Date().toISOString().slice(0, 10);
      let existing: { id: string; alignment_count: number } | null = null;

      if (userId) {
        const { data } = await sb
          .from("usage_tracking")
          .select("id, alignment_count")
          .eq("user_id", userId)
          .eq("usage_date", today)
          .maybeSingle();
        existing = data;
      } else if (sessionToken) {
        const { data } = await sb
          .from("usage_tracking")
          .select("id, alignment_count")
          .eq("session_token", sessionToken)
          .eq("usage_date", today)
          .maybeSingle();
        existing = data;
      }

      if (existing && existing.alignment_count >= DAILY_FREE_LIMIT) {
        return new Response(JSON.stringify({
          status: "error",
          request_id: requestId,
          error_code: "RATE_LIMIT",
          message: `Daily free limit reached (${DAILY_FREE_LIMIT} alignments per day). Upgrade to Resumix Pro for unlimited alignments.`,
          limit_reached: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Increment or insert usage
      if (existing) {
        await sb
          .from("usage_tracking")
          .update({ alignment_count: existing.alignment_count + 1, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await sb
          .from("usage_tracking")
          .insert({
            user_id: userId || null,
            session_token: sessionToken || null,
            ip_address: null,
            usage_date: today,
            alignment_count: 1,
          });
      }
    }

    const prompt = `You are Alignment Engine V2. Analyze resume vs JD. No fabrication. Address user as "you/your" only — never third person.

RULES: Never invent tools/metrics/certs. Only reframe existing experience. Return ONLY valid JSON.

DETERMINISTIC EXTRACTION (CRITICAL — follow exactly):
Step 1: JD SIGNAL EXTRACTION — Scan the job description from top to bottom. Extract priority signals in the order they appear. For each signal, count how many times it is referenced (frequency) and where it appears (title, first paragraph = high emphasis; later paragraphs = lower). Rank by frequency × emphasis. This extraction must be identical every time for the same JD text.

Step 2: RESUME SIGNAL EXTRACTION — Scan the resume from top to bottom. For each JD priority signal, search for exact keyword matches first, then semantic matches. Record presence/absence as a boolean. This extraction must be identical every time for the same resume text. Do not vary which signals you surface based on phrasing flexibility.

Step 3: SCORING — Using the extracted signals from Steps 1 and 2, compute match_score as a weighted sum. Count matches per dimension, apply the dimension weight, sum. The score is a mechanical computation from the extraction, not an impression.

SCORING (5 dimensions, weights in parens):
1) Role Outcomes (30%) 2) Tools & Workflow (20%) 3) Domain (20%) 4) Context & Scale (15%) 5) Communication & Leadership (15%)
Labels: 0-49=Weak, 50-64=Moderate, 65-79=Solid, 80+=Strong. No inflation. 80+ requires top-2 JD priority match + tool match + ownership signals.

BULLETS: Max 35 words, high-signal verbs, ATS-safe, no semicolons/em-dashes.
${userPlan === "pro" ? "3 variants: [0]Impact-Focused [1]Human-Natural [2]Keyword-Maximized" : "1 variant: primary (ATS-weighted to top JD priorities)"}

PRIORITIES: Extract 5-8 from JD with weights (0.05-0.25, sum=1.00). List in consistent priority order based on frequency and emphasis. Same JD must always produce the same priorities in the same order.

JSON SCHEMA:
{
  "inferred_role_title": "string",
  "optimized_bullets": [{"text":"string","variant":"string","used_signals":["string"],"removed_or_softened":["string"]}],
  "match_score": {"score":number,"label":"Weak|Moderate|Solid|Strong","score_rationale":["string — each item MUST be prefixed with either '[STRENGTH]' or '[GAP]' to indicate whether it describes a present positive signal or an absent/weak signal"]},
  "missing_keywords": ["string (3-10)"],
  "suggested_action_verbs": ["string (max 5)"],
  "alignment_intelligence_summary": "string (${userPlan === "pro" ? "4-6" : "2-3"} sentences)",
  "strategic_gap_actions": ["string (${userPlan === "pro" ? "up to 5" : "2-3"})"],
  "weighted_priority_commentary": ${userPlan === "pro" ? '"string (3-5 sentences)"' : 'null'},
  "strategic_bridge_analysis": ${userPlan === "pro" ? '{"why_it_translates":"string","perception_gaps":["string"],"interview_narrative":"string"}' : 'null'},
  "identity_strength_index": {
    "total_score": number,
    "pillars": [{"name":"Role Signal Clarity|Commercial Framing Power|Risk Compression Strength|Narrative Cohesion","score":number,"explanation":"string","improvement_lever":"string"}]
  },
  "jd_signal_extraction": {
    "role_identity_signals":["string"],"strategic_signals":["string"],"relationship_signals":["string"],
    "operational_signals":["string"],"leadership_signals":["string"],"priority_summary":"string"
  },
  "resume_signal_profile": {
    "operational_execution":{"strength":"Strong|Moderate|Weak|Missing","evidence":["string"]},
    "stakeholder_coordination":{"strength":"string","evidence":["string"]},
    "strategic_influence":{"strength":"string","evidence":["string"]},
    "performance_improvement":{"strength":"string","evidence":["string"]},
    "domain_expertise":{"strength":"string","evidence":["string"]}
  },
  "signal_alignment_analysis": [{"category":"string","alignment_level":"Strong|Moderate|Weak|Missing","current_signal":"string","perception_gap":"string","threshold_expectation":"string"}],
  "hiring_pipeline_simulation": [
    {"stage":"Recruiter Filter","status":"PASS|MODERATE RISK|HIGH RISK","criteria":["string"],"explanation":"string"},
    {"stage":"Hiring Manager Review","status":"string","criteria":["string"],"explanation":"string"},
    {"stage":"Panel Interview Signal","status":"string","criteria":["string"],"explanation":"string"}
  ],
  "executive_insight_summary": {"primary_insight":"string","primary_strength":"string","why_it_matters":"string","strategic_repositioning_opportunity":"string"},
  "transferable_signal_detection": {"detected_capability":"string","why_it_transfers":"string","elevation_opportunity":"string"},
  "signal_map": {"role_identity":number,"ownership_framing":number,"commercial_impact":number,"domain_expertise":number,"stakeholder_influence":number,"operational_execution":number} (DETERMINISTIC: given the same inputs always return the same dimension scores — do not vary),
  "signal_shift_estimates": {"ownership_signal":{"before":number,"after":number},"commercial_impact_signal":{"before":number,"after":number},"role_identity_clarity":{"before":number,"after":number},"domain_alignment":{"before":number,"after":number}},
  "career_signal_map": {
    "primary_alignment":[{"role":"string","score":number,"signals":["string"],"explanation":"string","matched_jd_dimensions":number}],
    "secondary_alignment":[{"role":"string","score":number,"signals":["string"],"explanation":"string","matched_jd_dimensions":number}]
  },
  "hiring_signal_benchmark": {"user_score":number,"median_candidate_score":number,"top_candidate_threshold":number,"dimension_comparison":[{"dimension":"string","user_score":number,"median_score":number,"gap_explanation":"string"}]},
  "interview_gap_diagnosis": {"primary_issue":"string","what_hiring_managers_see":["string"],"what_this_creates":"string","strategic_fixes":["string — EXACTLY 3 items, no more, no less, ranked by impact on match score"],"current_score":number,"predicted_score":number},
  "predicted_signal_lift": {"dimensions":[{"dimension":"string","lift":number}],"current_score":number,"predicted_score":number},
  "debug": {"mode":"${mode}","user_plan":"${userPlan}","bullet_count_requested":${userPlan === "pro" ? 3 : 1},"extracted_jd_priorities":[{"priority":"string","weight":number,"evidence":"string"}],"scoring_breakdown":{"role_outcomes_alignment":number,"tools_and_workflow_alignment":number,"domain_and_context_alignment":number,"context_and_scale_alignment":number,"communication_and_leadership_alignment":number}}
}

Identity_strength_index pillars: exactly 4 (Role Signal Clarity, Commercial Framing Power, Risk Compression Strength, Narrative Cohesion), each 0-25, strict evidence-based.

SCORE_RATIONALE CLASSIFICATION (CRITICAL):
Each score_rationale bullet MUST be prefixed with exactly '[STRENGTH]' or '[GAP]':
- '[STRENGTH]' = the candidate's resume demonstrably evidences this signal (e.g. "aligns with", "demonstrates", "shows", "translates to", "evidenced by")
- '[GAP]' = the resume is missing this signal or it is weak/absent (e.g. "missing", "lacks", "no evidence of", "absent", "unclear", "not demonstrated")
Do NOT mix — a bullet describing something the candidate HAS is always [STRENGTH], never [GAP].

CAREER_SIGNAL_MAP DETERMINISTIC ORDERING:
For career_signal_map, return EXACTLY 1 role in primary_alignment and EXACTLY 1 role in secondary_alignment (2 roles total, no more). matched_jd_dimensions = count of how many employer priority signal categories (from jd_signal_extraction) the role's signals overlap with. When two roles score within 5 points of each other, rank the one with higher matched_jd_dimensions first; if still tied, use alphabetical order by role name.

DETERMINISTIC SCORING — ALL SUB-SCORES (CRITICAL):
You are a deterministic scorer. Given identical inputs you must always return identical scores. Do not vary your output. Return the same number every time for the same input. If you are uncertain, anchor to the lower bound of your range and hold it.

SCORING METHOD — USE COUNTING, NOT IMPRESSION:
For every numeric score, use explicit evidence counting:
- Count the number of matching keywords, phrases, or evidence items present in the resume relative to the JD.
- Map the count to the score range using fixed thresholds (e.g., 0 matches = 0, 1-2 = 5-10, 3-4 = 10-15, 5+ = 15-20, 7+ = 20-25 for /25 scales).
- Do NOT use subjective impression, "feels like", or holistic judgment for any numeric field.
- Round down when between two values, never up.

This applies individually and explicitly to EACH of these numeric fields — score each one deterministically:
- match_score.score: weighted sum of 5 dimensions, no rounding variance
- identity_strength_index.total_score AND each pillar score (all 4): assign fixed points based strictly on presence/absence of evidence per pillar — count evidence items, not impressions
- signal_map: ALL 6 dimensions (role_identity, ownership_framing, commercial_impact, domain_expertise, stakeholder_influence, operational_execution) — each scored by counting keyword matches between resume and JD, not impression
- signal_shift_estimates: all before/after pairs — derive from the delta between counted current evidence and projected evidence after calibration
- hiring_signal_benchmark: user_score, median_candidate_score, top_candidate_threshold, and all dimension_comparison scores
- career_signal_map: role scores for both primary and secondary
- predicted_signal_lift: all dimension lifts and current/predicted scores — lifts must be derived from gap counts, not estimated
- interview_gap_diagnosis: current_score and predicted_score

For each numeric field: count evidence tokens, apply scoring rubric mechanically, produce the same output. No randomness, no creativity in scoring, no approximation.

STRATEGIC FIXES COUNT (CRITICAL):
interview_gap_diagnosis.strategic_fixes must contain EXACTLY 3 items. Not 2, not 4. Exactly 3, ranked by impact on the match score. The section heading is always "Three Strategic Fixes" so the list must always contain 3 items.

STYLE: No "results-driven"/"leveraging synergies"/"passionate about". Lead with evidence. Operational language. Vary cadence. No markdown/code fences.

EXPERIENCE_INPUT: ${cleanBullet}

JOB_DESCRIPTION: ${cleanJd}

USER_PLAN: ${userPlan}`;

    let titan: Record<string, unknown>;
    
    // First attempt
    let content = await callAI(apiKey, prompt, 5000);
    try {
      titan = extractJSON(content);
    } catch (firstErr) {
      console.error("First parse attempt failed. Preview:", content.slice(0, 300));
      
      // Retry with strict JSON instruction
      console.log("Retrying with strict JSON instruction...");
      const strictNote = "CRITICAL: Return only a valid JSON object. No markdown, no code fences, no preamble, no explanation. Start your response with { and end with }.";
      const retryContent = await callAI(apiKey, prompt, 5000, strictNote);
      try {
        titan = extractJSON(retryContent);
      } catch (secondErr) {
        console.error("Second parse attempt also failed. Preview:", retryContent.slice(0, 300));
        throw new Error("Signal calibration response could not be processed. Please try again.");
      }
    }

    // Map Titan contract to the shape the frontend expects
    const optimizedBullet = titan.optimized_bullets?.[0]?.text || "";
    const matchScore = titan.match_score?.score ?? 0;
    const confidenceLevel = titan.match_score?.label || "";
    const missingKeywords = titan.missing_keywords || [];
    const suggestedVerbs = titan.suggested_action_verbs || [];
    const alignmentNotes = titan.alignment_intelligence_summary || "";
    const gapSuggestions = titan.strategic_gap_actions?.length
      ? titan.strategic_gap_actions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")
      : null;

    const altA = titan.optimized_bullets?.[1]?.text || optimizedBullet;
    const altB = titan.optimized_bullets?.[2]?.text || optimizedBullet;

    const priorities = titan.debug?.extracted_jd_priorities || [];
    const topMatchedSignal = priorities.length > 0 ? priorities[0].priority : null;
    const topMissingSignal = missingKeywords.length > 0 ? missingKeywords[0] : null;

    const breakdown = titan.debug?.scoring_breakdown || {};
    const scoreRationale = titan.match_score?.score_rationale || [];

    const weightedPriorityCommentary = titan.weighted_priority_commentary || null;
    const strategicBridgeAnalysis = titan.strategic_bridge_analysis || null;

    // Build unified SignalModel
    const signalModel = {
      role: {
        title: (titan.inferred_role_title as string) || "",
        level_inferred: confidenceLevel,
        confidence: confidenceLevel || "Weak",
      },
      weights: {
        operational: priorities.find((p: any) => /operat/i.test(p.priority))?.weight || 0.15,
        stakeholder: priorities.find((p: any) => /stakeholder|relationship|partner/i.test(p.priority))?.weight || 0.15,
        strategic: priorities.find((p: any) => /strateg/i.test(p.priority))?.weight || 0.20,
        performance: priorities.find((p: any) => /perform|impact|outcome/i.test(p.priority))?.weight || 0.25,
        domain: priorities.find((p: any) => /domain|industry|sector/i.test(p.priority))?.weight || 0.25,
      },
      strengths: (titan.resume_signal_profile
        ? Object.entries(titan.resume_signal_profile as Record<string, any>)
            .filter(([, v]) => v?.strength === "Strong" || v?.strength === "Moderate")
            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.evidence?.[0] || v.strength}`)
        : []),
      gaps: (titan.signal_alignment_analysis as any[] || [])
        .filter((a: any) => a.alignment_level === "Weak" || a.alignment_level === "Missing")
        .map((a: any) => a.perception_gap || a.category),
      under_signaled_keywords: missingKeywords as string[],
      evidence_ledger: [
        ...(titan.resume_signal_profile
          ? Object.entries(titan.resume_signal_profile as Record<string, any>)
              .flatMap(([k, v]) => (v?.evidence || []).map((e: string) => ({ claim: k.replace(/_/g, " "), source: "resume" as const, evidence: e })))
          : []),
        ...priorities.map((p: any) => ({ claim: p.priority, source: "jd" as const, evidence: p.evidence || "" })),
      ],
      risk_projection: {
        stages: titan.hiring_pipeline_simulation || [],
      },
      recommended_rewrites: {
        bullets: titan.optimized_bullets || [],
      },
      resume_signal_profile: titan.resume_signal_profile || null,
      jd_signal_extraction: titan.jd_signal_extraction || null,
      signal_alignment_analysis: titan.signal_alignment_analysis || [],
      executive_insight_summary: titan.executive_insight_summary || null,
      transferable_signal_detection: titan.transferable_signal_detection || null,
      signal_map: titan.signal_map || null,
      signal_shift_estimates: titan.signal_shift_estimates || null,
      identity_strength_index: titan.identity_strength_index || null,
      career_signal_map: (() => {
        const csm = titan.career_signal_map as any;
        if (!csm) return null;
        // Deterministic tiebreaker: sort by score desc, then matched_jd_dimensions desc, then role name asc
        const sortEntries = (arr: any[]) => {
          if (!Array.isArray(arr)) return arr;
          return [...arr].sort((a, b) => {
            const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
            if (Math.abs(scoreDiff) > 5) return scoreDiff;
            const dimDiff = (b.matched_jd_dimensions ?? 0) - (a.matched_jd_dimensions ?? 0);
            if (dimDiff !== 0) return dimDiff;
            return (a.role ?? "").localeCompare(b.role ?? "");
          });
        };
        // Merge all roles, sort deterministically, then cap at 1 primary + 1 secondary
        const allRoles = [
          ...(csm.primary_alignment || []),
          ...(csm.secondary_alignment || []),
        ];
        const sorted = sortEntries(allRoles);
        return {
          primary_alignment: sorted.slice(0, 1),
          secondary_alignment: sorted.slice(1, 2),
        };
      })(),
      hiring_signal_benchmark: titan.hiring_signal_benchmark || null,
      interview_gap_diagnosis: titan.interview_gap_diagnosis || null,
      predicted_signal_lift: titan.predicted_signal_lift || null,
      match_score: titan.match_score || { score: matchScore, label: confidenceLevel, score_rationale: [] },
      scoring_breakdown: breakdown,
    };

    const result = {
      optimized_bullet: optimizedBullet,
      match_score: matchScore,
      alignment_confidence_level: confidenceLevel,
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
      alignment_notes: alignmentNotes,
      gap_suggestions: gapSuggestions,
      top_matched_signal: topMatchedSignal,
      top_missing_signal: topMissingSignal,
      score_rationale: scoreRationale,
      scoring_breakdown: breakdown,
      extracted_jd_priorities: priorities,
      used_signals: titan.optimized_bullets?.[0]?.used_signals || [],
      removed_or_softened: titan.optimized_bullets?.[0]?.removed_or_softened || [],
      weighted_priority_commentary: weightedPriorityCommentary,
      strategic_bridge_analysis: strategicBridgeAnalysis,
      identity_strength_index: titan.identity_strength_index || null,
      inferred_role_title: (titan.inferred_role_title as string) || null,
      // Signal diagnostic modules (legacy direct access)
      jd_signal_extraction: titan.jd_signal_extraction || null,
      resume_signal_profile: titan.resume_signal_profile || null,
      signal_alignment_analysis: titan.signal_alignment_analysis || null,
      hiring_pipeline_simulation: titan.hiring_pipeline_simulation || null,
      executive_insight_summary: titan.executive_insight_summary || null,
      transferable_signal_detection: titan.transferable_signal_detection || null,
      signal_shift_estimates: titan.signal_shift_estimates || null,
      signal_map: titan.signal_map || null,
      career_signal_map: signalModel.career_signal_map || null,
      hiring_signal_benchmark: titan.hiring_signal_benchmark || null,
      interview_gap_diagnosis: titan.interview_gap_diagnosis || null,
      predicted_signal_lift: titan.predicted_signal_lift || null,
      // Unified SignalModel
      signal_model: signalModel,
    };

    // Save to database
    await sb.from("optimizations").insert({
      user_id: userId || null,
      input_bullet: cleanBullet,
      input_jd: cleanJd,
      optimized_bullet: optimizedBullet,
      match_score: Math.round(matchScore),
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
    }).throwOnError();

    // Cache the result for repeat analyses
    setCache(cacheKey, result);

    return new Response(JSON.stringify({ status: "success", request_id: requestId, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack || "" : "";
    console.error(JSON.stringify({
      event: "request_error",
      request_id: requestId,
      function: "optimize-bullet",
      error_message: message,
      timestamp: new Date().toISOString(),
    }));
    const friendly =
      message.includes("Rate limits") ? "Too many requests. Please wait a moment and try again." :
      message.includes("Daily free limit") ? message :
      message.includes("unavailable") ? "AI service is temporarily busy. Please try again." :
      message.includes("calibration") || message.includes("parse") ? "Signal calibration is taking longer than expected. Tap to try again — your alignment data is saved." :
      message.includes("aborted") ? "Analysis took too long. Please retry." :
      "Analysis engine temporarily unavailable. Please try again.";
    return new Response(JSON.stringify({
      status: "error",
      request_id: requestId,
      error_code: message.includes("Daily free limit") ? "RATE_LIMIT" : "ENGINE_ERROR",
      message: friendly,
      limit_reached: message.includes("Daily free limit"),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
