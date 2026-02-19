import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Model router: use Pro for large inputs (>10k chars combined), Flash otherwise
const MODELS_LARGE = [
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5-mini",
];
const MODELS_SMALL = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5-mini",
];
const LARGE_INPUT_THRESHOLD = 10000;

// Simple in-memory result cache (keyed by SHA-256 of inputs)
const resultCache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function hashInputs(experience: string, jd: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(experience + "|||" + jd));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callAI(apiKey: string, prompt: string, inputLen: number): Promise<string> {
  const models = inputLen > LARGE_INPUT_THRESHOLD ? MODELS_LARGE : MODELS_SMALL;
  console.log(`Input length: ${inputLen} → using ${inputLen > LARGE_INPUT_THRESHOLD ? "LARGE (Pro)" : "SMALL (Flash)"} model set`);

  for (const model of models) {
    console.log(`Trying model: ${model}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      clearTimeout(timeout);
      console.log(`${model} status:`, aiRes.status);
      if (aiRes.ok) {
        const data = await aiRes.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (content) { console.log(`Success: ${model}`); return content; }
      } else {
        const err = await aiRes.text();
        console.error(`${model} error:`, err);
        if (aiRes.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (aiRes.status === 402) throw new Error("Usage limit reached. Please add credits to your workspace.");
      }
    } catch (e) {
      clearTimeout(timeout);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Rate limits") || msg.includes("Usage limit")) throw e;
      console.error(`${model} threw:`, msg);
    }
  }
  throw new Error("Service temporarily unavailable. Please try again in a moment.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { experience, jd } = await req.json();
    if (!experience || !jd) {
      return new Response(JSON.stringify({ error: "Missing experience or jd" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cacheKey = await hashInputs(experience, jd);
    const cached = resultCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      console.log("Cache HIT:", cacheKey.slice(0, 8));
      return new Response(cached.data, {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const inputLen = experience.length + jd.length;

    const prompt = `You are a Strategic Positioning Engine. Reposition a candidate's resume for a target role WITHOUT fabrication — only reframe real facts.

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

RESUME: ${experience}

JOB DESCRIPTION: ${jd}`;

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

    return new Response(responseBody, {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("titan-position error:", message);
    const status = message.includes("Rate limits") ? 429 : message.includes("Usage limit") ? 402 : 500;
    const friendly =
      status === 429 ? "Too many requests. Please wait a moment and try again." :
      status === 402 ? "Usage limit reached. Please add credits to continue." :
      message.includes("unavailable") ? "Our AI service is temporarily busy. Please try again in a moment." :
      message.includes("parse") ? "The AI returned an unexpected response. Please try again." :
      "Something went wrong generating your package. Please try again.";
    return new Response(JSON.stringify({ error: friendly, detail: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
