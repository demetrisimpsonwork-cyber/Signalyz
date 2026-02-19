import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5-mini",
];

async function callAI(apiKey: string, prompt: string): Promise<string> {
  for (const model of MODELS) {
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, jd, userId, mode = "single_bullet" } = await req.json();

    if (!bullet || !jd) {
      return new Response(JSON.stringify({ error: "Missing bullet or jd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const userPlan = mode === "multi_bullet" ? "pro" : "free";

    const prompt = `You are Alignment Engine V2 (Titan).

Your function is to analyze resume experience against a job description and generate structured alignment output without fabrication.

YOU MUST:
- Never invent tools, metrics, certifications, or domain experience.
- Only elevate, reframe, and optimize based on provided input.
- Preserve factual integrity at all times.

INPUTS:
- EXPERIENCE_INPUT
- JOB_DESCRIPTION
- USER_PLAN: ${userPlan}

-------------------------------------
SCORING MODEL
-------------------------------------

Score across 5 weighted dimensions:
1) Role Outcomes & Deliverables (30%) → role_outcomes_alignment
2) Tools & Workflow Signals (20%) → tools_and_workflow_alignment
3) Domain Alignment (20%) → domain_and_context_alignment
4) Context & Scale (15%) → context_and_scale_alignment
5) Communication & Leadership Signals (15%) → communication_and_leadership_alignment

Alignment Levels:
- 0–49 = Weak
- 50–64 = Moderate
- 65–79 = Solid
- 80+ = Strong

Do NOT inflate score. Score must reflect realistic fit based on provided experience.
Strong Alignment (80+) requires clear match on top 2 JD priorities AND at least one tool/workflow match AND credible ownership signals.

-------------------------------------
BULLET GENERATION RULES
-------------------------------------

Bullets must:
- Be 1–2 lines, not exceed 35 words
- Use high-signal verbs
- Avoid exaggeration
- Reflect only given experience
- Be ATS-safe (no semicolons, no em dashes)

IF USER_PLAN = "free":
  optimized_bullets must contain EXACTLY 1 object (primary: direct, ATS-weighted to top JD priorities).

IF USER_PLAN = "pro":
  optimized_bullets must contain EXACTLY 3 objects:
  [0] Impact-Focused — metric-forward tone, outcome-driven, emphasize ownership/delivery/revenue
  [1] Human-Natural — interview-ready, natural professional tone, strong clarity, slightly less formal
  [2] Keyword-Maximized — ATS-aligned, dense with role-relevant terminology, keyword-optimized

-------------------------------------
WEIGHTED PRIORITY EXTRACTION
-------------------------------------

Extract 5–8 priorities from JOB_DESCRIPTION. Each must include:
- priority theme
- weight (0.05–0.25) based on repetition, must/required/mandatory signals, role framing
Weights must sum to 1.00.

-------------------------------------
TITAN OUTPUT CONTRACT (STRICT JSON)
-------------------------------------

Return ONLY this JSON object with EXACT keys:
{
  "optimized_bullets": [
    {
      "text": "string",
      "variant": "primary" | "impact_focused" | "human_natural" | "keyword_maximized",
      "used_signals": ["string"],
      "removed_or_softened": ["string"]
    }
  ],
  "match_score": {
    "score": number,
    "label": "Weak" | "Moderate" | "Solid" | "Strong",
    "score_rationale": ["string"]
  },
  "missing_keywords": ["string (3–10 items max, ranked by importance)"],
  "suggested_action_verbs": ["string (5 items max, aligned to JD tone and ownership level)"],
  "alignment_intelligence_summary": "string (pro: 4–6 sentences; free: 2–3 sentences — what was elevated, what gaps remain, how transferable skills were repositioned)",
  "strategic_gap_actions": ["string (2–3 for free, up to 5 for pro — actionable, truthful, behavior-based)"],
  "weighted_priority_commentary": ${userPlan === "pro" ? '"string (pro only: 3–5 sentences explaining how JD priorities were weighted and which signals drove the score)"' : 'null'},
  "strategic_bridge_analysis": ${userPlan === "pro" ? '{ "why_it_translates": "string", "perception_gaps": ["string"], "interview_narrative": "string" }' : 'null'},
  "identity_strength_index": {
    "total_score": number (0–100, sum of 4 pillar scores),
    "pillars": [
      {
        "name": "Role Signal Clarity",
        "score": number (0–25, strict signal read — not aspirational),
        "explanation": "string (2–3 sentences: how clearly the resume projects role identity aligned to this JD — based only on observable signals)",
        "improvement_lever": "string (one concise, actionable positioning change — no fabrication)"
      },
      {
        "name": "Commercial Framing Power",
        "score": number (0–25),
        "explanation": "string (2–3 sentences: how effectively the resume frames commercial impact, revenue ownership, and measurable outcomes relative to JD requirements)",
        "improvement_lever": "string"
      },
      {
        "name": "Risk Compression Strength",
        "score": number (0–25),
        "explanation": "string (2–3 sentences: how well the resume reduces perceived hiring risk — stability, ownership signals, context match, transition logic)",
        "improvement_lever": "string"
      },
      {
        "name": "Narrative Cohesion",
        "score": number (0–25),
        "explanation": "string (2–3 sentences: how coherent and consistent the career narrative is relative to the JD — does the arc logically lead to this role?)",
        "improvement_lever": "string"
      }
    ]
  },
  "debug": {
    "mode": "${mode}",
    "user_plan": "${userPlan}",
    "bullet_count_requested": ${userPlan === "pro" ? 3 : 1},
    "extracted_jd_priorities": [
      { "priority": "string", "weight": number, "evidence": "string" }
    ],
    "scoring_breakdown": {
      "role_outcomes_alignment": number,
      "tools_and_workflow_alignment": number,
      "domain_and_context_alignment": number,
      "context_and_scale_alignment": number,
      "communication_and_leadership_alignment": number
    }
  }
}

RULES:
- No markdown. No code fences. No text outside the JSON.
- weighted_priority_commentary and strategic_bridge_analysis must be null for free plan.

EXPERIENCE_INPUT: ${bullet}

JOB_DESCRIPTION: ${jd}

USER_PLAN: ${userPlan}`;

    let content = await callAI(apiKey, prompt);
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let titan: Record<string, unknown>;
    try {
      titan = JSON.parse(content);
    } catch {
      console.error("JSON parse failed. Preview:", content.slice(0, 300));
      throw new Error("Failed to parse AI response. Please try again.");
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

    // Pro plan: [0]=impact_focused, [1]=human_natural, [2]=keyword_maximized
    const altA = titan.optimized_bullets?.[1]?.text || optimizedBullet;
    const altB = titan.optimized_bullets?.[2]?.text || optimizedBullet;

    const priorities = titan.debug?.extracted_jd_priorities || [];
    const topMatchedSignal = priorities.length > 0 ? priorities[0].priority : null;
    const topMissingSignal = missingKeywords.length > 0 ? missingKeywords[0] : null;

    const breakdown = titan.debug?.scoring_breakdown || {};
    const scoreRationale = titan.match_score?.score_rationale || [];

    // Pro-only fields
    const weightedPriorityCommentary = titan.weighted_priority_commentary || null;
    const strategicBridgeAnalysis = titan.strategic_bridge_analysis || null;

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
      // Pro-only
      weighted_priority_commentary: weightedPriorityCommentary,
      strategic_bridge_analysis: strategicBridgeAnalysis,
      identity_strength_index: titan.identity_strength_index || null,
    };

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    await sb.from("optimizations").insert({
      user_id: userId || null,
      input_bullet: bullet,
      input_jd: jd,
      optimized_bullet: optimizedBullet,
      match_score: matchScore,
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
    }).throwOnError();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("Rate limits") ? 429 : message.includes("Usage limit") ? 402 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
