import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { experience, jd } = await req.json();

    if (!experience || !jd) {
      return new Response(JSON.stringify({ error: "Missing experience or jd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are a Strategic Positioning Engine designed to reposition a candidate's background for high-complexity technical-commercial roles without fabrication.

Your objective is NOT to keyword stuff. Your objective is to shift perceived identity.

ANTI-FABRICATION RULE (NON-NEGOTIABLE):
- Use ONLY facts present in RESUME_INPUT. Reframe and elevate phrasing; never add new facts.
- Do NOT invent tools, certifications, revenue numbers, domain expertise, or engineering knowledge.
- If the resume lacks sales, engineering, specific tools, or industry knowledge — do NOT imply it exists.
- Instead: reframe adjacent experience, elevate cognitive parallels, highlight transferable complexity, focus on stakeholder management.

TONE STANDARD: Sharp. Structured. Confident. Strategic. Human. Zero fluff. Zero fantasy. High credibility.
No hyphenated phrases. No filler language. No buzzword stacking. No clichés.

OUTPUT CONTRACT — Return ONLY this JSON object with EXACT keys. No markdown. No code fences. No text outside the JSON.

{
  "role_dna": [
    {
      "pillar": "string (pillar name)",
      "weight": "High | Medium | Low",
      "description": "string (1 sentence explaining what employer is prioritising here)"
    }
  ],
  "repositioning_matrix": [
    {
      "pillar": "string (matches role_dna pillar name)",
      "matching_experience": "string (real experience from resume that maps here)",
      "role_native_language": "string (reframed in role vocabulary — no fabrication)",
      "transferable_complexity": "string (what cognitive or operational complexity transfers)"
    }
  ],
  "commercial_value_conversion": [
    {
      "original_framing": "string (how candidate currently describes this)",
      "commercial_reframe": "string (converted to revenue-protective or revenue-supporting language)",
      "quantified_impact": "string (metric or scope if available, else leave as contextual scale)"
    }
  ],
  "gap_strategy": {
    "hard_gaps": ["string — factual gap: degree, certification, industry experience"],
    "perception_gaps": ["string — soft gap: sales ownership, revenue accountability, seniority signals"],
    "mitigation": [
      {
        "gap": "string (the gap being addressed)",
        "resume_edit": "string (exact language change for resume)",
        "interview_narrative": "string (how to verbally frame it)",
        "micro_credential": "string (optional course or credential to signal intent — or 'N/A')"
      }
    ]
  },
  "optimized_summary": "string (120–180 words — professional summary rebuilt so candidate reads as a technical-commercial operator: ownership signals, business impact, employer priority alignment, no fluff)",
  "bullet_rewrites": [
    {
      "original": "string (original bullet or responsibility)",
      "rewritten": "string (elite rewrite: project ownership, commercial language, timeline/deliverable framing — max 35 words)"
    }
  ],
  "interview_dominance_script": "string (5-sentence positioning narrative bridging into: target sectors from JD — confident, structured, non-defensive, no insecurity framing)",
  "match_score_forecast": {
    "before_percent": number,
    "after_percent": number,
    "rationale": "string (2–3 sentences explaining what changed and why the after score is justified)"
  },
  "market_position_assessment": {
    "level": "Support-Level | Operational-Level | Mid-Level Professional | Strategic-Level | Leadership-Level",
    "explanation": "string (2–3 sentences: why this level — based on ownership language, impact framing, scope signals, decision authority in the resume)",
    "under_positioned": boolean,
    "under_positioned_explanation": "string (if under_positioned is true: how the candidate is under-positioned relative to the JD — else empty string)"
  },
  "competitive_risk_signals": [
    {
      "area": "string (e.g. Commercial Impact Clarity, Revenue Ownership Signals, Leadership Visibility, Technical Depth, Strategic Decision Authority, Presentation Authority)",
      "explanation": "string (1–2 sentences: where a stronger competing candidate would outperform — signal gap only, no fabrication)"
    }
  ],
  "interview_trajectory": {
    "likely_focus_areas": ["string — 2–3 topics the interviewer will probe based on alignment strength and JD emphasis"],
    "likely_objection": "string (1 realistic objection the employer may raise about this candidate)",
    "strategic_angle": "string (1 angle the candidate should proactively emphasize to pre-empt objection and strengthen positioning)"
  },
  "employer_risk_perception": [
    {
      "category": "Capability Risk",
      "rating": "Low | Medium | High",
      "explanation": "string (2–3 sentences: how the hiring manager evaluates whether this candidate can execute the role — based only on signals present in the resume vs JD requirements)",
      "mitigation": "string (1 sentence: exact positioning language to reduce perceived risk — no fabrication, no new claims)"
    },
    {
      "category": "Context Risk",
      "rating": "Low | Medium | High",
      "explanation": "string (2–3 sentences: whether the candidate has operated in a similar environment, sector, or organisational complexity — signal-based only)",
      "mitigation": "string (1 sentence: positioning language to close the context gap)"
    },
    {
      "category": "Signal Risk",
      "rating": "Low | Medium | High",
      "explanation": "string (2–3 sentences: how clearly the resume projects role identity — ownership language, title alignment, decision authority signals)",
      "mitigation": "string (1 sentence: positioning language to strengthen signal clarity)"
    },
    {
      "category": "Stability Risk",
      "rating": "Low | Medium | High",
      "explanation": "string (2–3 sentences: career consistency, tenure patterns, transition logic — as a hiring manager would read it)",
      "mitigation": "string (1 sentence: positioning language to frame transitions as intentional, not erratic)"
    },
    {
      "category": "Commercial Impact Risk",
      "rating": "Low | Medium | High",
      "explanation": "string (2–3 sentences: revenue ownership, measurable outcomes, scale exposure — gaps a commercial employer would flag immediately)",
      "mitigation": "string (1 sentence: positioning language to elevate commercial credibility without fabrication)"
    }
  ]
}

Rules for arrays:
- role_dna: exactly 5 pillars extracted from JD
- repositioning_matrix: one entry per role_dna pillar (5 total)
- commercial_value_conversion: 3–5 most impactful conversions
- gap_strategy.hard_gaps: 1–3 items max
- gap_strategy.perception_gaps: 2–4 items max
- gap_strategy.mitigation: one entry per gap identified
- bullet_rewrites: 5–7 bullets from most relevant role
- competitive_risk_signals: exactly 2–4 items (no fabrication — signal gaps only)
- interview_trajectory.likely_focus_areas: exactly 2–3 items
- employer_risk_perception: exactly 5 items — one per category above, in order. Rating must be a precise signal read — not aspirational. Mitigation must be positioning language only, never new claims.

RESUME_INPUT: ${experience}

JOB_DESCRIPTION_INPUT: ${jd}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.65,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${errText}`);
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const titan = JSON.parse(content);

    return new Response(JSON.stringify(titan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
