import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Input limits ────────────────────────────────────────────────────────────
const MAX_RESUME_CHARS = 10000;
const MAX_JD_CHARS = 8000;
const MAX_COMBINED_CHARS = 16000;

// ─── Cache ───────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
const resultCache = new Map<string, { data: string; ts: number }>();

async function hashInputs(a: string, b: string): Promise<string> {
  const enc = new TextEncoder().encode(a + "||" + b);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

// ─── Input normalization ─────────────────────────────────────────────────────

function normalizeText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripResumeHeader(text: string): string {
  const lines = text.split("\n");
  let skipUntil = 0;
  const headerPatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,
    /\b[\w.-]+@[\w.-]+\.\w{2,}\b/,
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
    /^\d+\s+\w+\s+(street|st|ave|avenue|blvd|rd|dr)/i,
    /^(linkedin|github|portfolio)/i,
    /^(http|www\.)/i,
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

async function callAI(apiKey: string, prompt: string, _inputLen: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
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
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timeout);
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const { experience, jd } = await req.json();

    console.log(JSON.stringify({
      event: "request_start",
      request_id: requestId,
      function: "titan-position",
      timestamp: new Date().toISOString(),
      resume_text_length: typeof experience === "string" ? experience.length : 0,
      jd_text_length: typeof jd === "string" ? jd.length : 0,
    }));

    if (!experience || typeof experience !== "string" || !jd || typeof jd !== "string") {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INVALID_INPUT", message: "Missing resume or job description.", details: { resume_len: 0, jd_len: 0 } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize and enforce limits
    let cleanExp = normalizeText(stripResumeHeader(experience.trim()));
    let cleanJd = normalizeText(jd.trim());
    const limits = enforceCharLimits(cleanExp, cleanJd);
    cleanExp = limits.resume;
    cleanJd = limits.jd;

    if (cleanExp.length < 20) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Please paste more of your Experience section so Resumix can analyze your signal.", details: { resume_len: cleanExp.length, jd_len: cleanJd.length } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cacheKey = await hashInputs(cleanExp, cleanJd);
    const cached = resultCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      console.log("Cache HIT:", cacheKey.slice(0, 8));
      return new Response(cached.data, {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const inputLen = cleanExp.length + cleanJd.length;

    const prompt = `You are a Strategic Positioning Engine. Reposition a candidate's resume for a target role WITHOUT fabrication — only reframe real facts.

Address the user directly in second person throughout all output. Use 'you' and 'your' exclusively. Never use the candidate's name or third-person pronouns (he/his/she/her/they/their) when referring to the candidate or their experience.

RULES:
- No invented tools, certs, metrics, or expertise
- Reframe existing experience in role vocabulary
- Tone: sharp, analytical, executive. No fluff.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

JSON SCHEMA (return exactly this structure):
{
  "role_dna": [{"pillar":string,"weight":"High|Medium|Low","description":string}],
  "repositioning_matrix": [{"pillar":string,"matching_experience":string,"role_native_language":string,"transferable_complexity":string}],
  "commercial_value_conversion": [{"original_framing":string,"commercial_reframe":string,"quantified_impact":string}],
  "gap_strategy": {
    "hard_gaps": [string],
    "perception_gaps": [string],
    "mitigation": [{"gap":string,"resume_edit":string,"interview_narrative":string,"micro_credential":string}]
  },
  "optimized_summary": string,
  "bullet_rewrites": [{"original":string,"rewritten":string}],
  "interview_dominance_script": string,
  "match_score_forecast": {"before_percent":number,"after_percent":number,"rationale":string},
  "market_position_assessment": {"level":"Support-Level|Operational-Level|Mid-Level Professional|Strategic-Level|Leadership-Level","explanation":string,"under_positioned":boolean,"under_positioned_explanation":string},
  "competitive_risk_signals": [{"area":string,"explanation":string}],
  "interview_trajectory": {"likely_focus_areas":[string],"likely_objection":string,"strategic_angle":string},
  "employer_risk_perception": [
    {"category":"Capability Risk","rating":"Low|Medium|High","explanation":string,"mitigation":string},
    {"category":"Context Risk","rating":"Low|Medium|High","explanation":string,"mitigation":string},
    {"category":"Signal Risk","rating":"Low|Medium|High","explanation":string,"mitigation":string},
    {"category":"Stability Risk","rating":"Low|Medium|High","explanation":string,"mitigation":string},
    {"category":"Commercial Impact Risk","rating":"Low|Medium|High","explanation":string,"mitigation":string}
  ]
}

ARRAY SIZES:
- role_dna: exactly 5 pillars from JD
- repositioning_matrix: 5 entries (one per role_dna pillar)
- commercial_value_conversion: 3–5 items
- gap_strategy.hard_gaps: 1–3 items; perception_gaps: 2–4 items; mitigation: one per gap
- bullet_rewrites: 5–7 bullets (max 35 words each)
- competitive_risk_signals: 2–4 items
- interview_trajectory.likely_focus_areas: 2–3 items
- employer_risk_perception: exactly 5 items in order above
- optimized_summary: 120–180 words

RESUME: ${cleanExp}

JOB DESCRIPTION: ${cleanJd}`;

    let content = await callAI(apiKey, prompt, inputLen);
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let titan: Record<string, unknown>;
    try {
      titan = JSON.parse(content);
    } catch {
      console.error("JSON parse failed. Preview:", content.slice(0, 300));
      throw new Error("Failed to parse AI response. Please try again.");
    }

    const responseBody = JSON.stringify(titan);

    // ── Cache store ───────────────────────────────────────────────────────────
    resultCache.set(cacheKey, { data: responseBody, ts: Date.now() });
    // Keep cache bounded to 50 entries, evict oldest
    if (resultCache.size > 50) {
      const oldest = [...resultCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
      resultCache.delete(oldest);
    }

    return new Response(JSON.stringify({ status: "success", request_id: requestId, ...titan, truncated: limits.truncated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Resumix engine error:", message);
    const friendly =
      message.includes("Rate limits") ? "Too many requests. Please wait a moment and try again." :
      message.includes("unavailable") ? "Our AI service is temporarily busy. Please try again in a moment." :
      message.includes("parse") ? "The AI returned an unexpected response. Please try again." :
      message.includes("aborted") ? "Analysis took too long. Please retry." :
      "Analysis engine temporarily unavailable. Please try again.";
    return new Response(JSON.stringify({ status: "error", error: friendly, detail: message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
