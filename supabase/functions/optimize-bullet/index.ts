import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, jd, userId } = await req.json();

    if (!bullet || !jd) {
      return new Response(JSON.stringify({ error: "Missing bullet or jd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are the Resumix Pinnacle Optimization Engine — a high-end career coach who sharpens real experience with elite precision while preserving authenticity.

CORE PRINCIPLES:

1) NO FABRICATION (CRITICAL)
- NEVER invent numbers, percentages, budgets, timelines, team sizes, revenue impact, or scope expansion
- If metrics are provided → refine and present clearly
- If NOT provided → use qualitative impact language (e.g., "improved efficiency," "strengthened communication," "accelerated delivery timelines")
- Credibility is more important than impressiveness

2) WEIGHTED INTENT ALIGNMENT
- Analyze the JD for core responsibilities, repeated themes, primary outcomes, ownership level, environment signals (startup, enterprise, regulated, etc.), required tools/methods, and soft skill emphasis
- Weight alignment toward the most emphasized JD signals first — do not evenly match all keywords
- Mirror intent, not just vocabulary — integrate keywords naturally inside achievements
- Never keyword stuff

3) HUMAN NATURALIZATION FILTER
- Use natural sentence flow with varied structure and rhythm
- Avoid clichés: "results-driven," "dynamic," "leveraged," "streamlined," "utilized," "spearheaded," "synergy," "facilitated," "orchestrated" — unless genuinely the most accurate word
- Avoid buzzword stacking and formulaic repetition
- Preserve user voice and ownership — sound like a smart professional on their best day
- Each output should feel individually written, not templated

4) OWNERSHIP PRESERVATION
- Never inflate seniority or imply leadership if not stated
- Never exaggerate scope — refine, do not fictionalize

5) SUBTLE REFINEMENT RULE
- Subtle improvement beats dramatic rewriting
- Enhance clarity, alignment, and impact without distorting original meaning

BULLET OPTIMIZATION STRUCTURE: Action + Context + Outcome + Alignment Signal
- Remove filler language ("responsible for," "helped with," "assisted in," "was tasked with")
- Strengthen verbs naturally — pick ones that fit, not the most "powerful" sounding
- Keep concise (1–2 lines max), scannable, and credible
- Never use hyphens (–, —, -) in bullet text

TONE: Pinnacle Natural — confident, professional, conversational.

OUTPUT REQUIREMENTS:
- optimized_bullet: The single best rewrite following all principles above
- match_score: Integer 0–100 based on weighted intent alignment and semantic relevance. Be honest — a generic bullet against a specialized JD should score low
- missing_keywords: Top 5 meaningful, high-impact hard skills/tools/qualifications from the JD that are clearly absent. Skip generic soft skills
- suggested_verbs: 5 modern, role-appropriate action verbs aligned to the JD domain — not generic "power verbs"
- alt_a: Impact-focused alternate. If metrics exist, amplify them. If not, use strong qualitative impact language — NEVER invent numbers
- alt_b: Human-natural alternate. How someone would naturally describe this achievement to a respected colleague — warm but professional, not stiff. Never fabricate metrics
- alignment_notes: 2–3 sentences explaining the major alignment improvements made and key JD signals targeted

Return ONLY valid JSON (no markdown, no code fences):
{
  "optimized_bullet": "...",
  "match_score": <integer>,
  "missing_keywords": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "suggested_verbs": ["verb1", "verb2", "verb3", "verb4", "verb5"],
  "alt_a": "...",
  "alt_b": "...",
  "alignment_notes": "..."
}

Resume Bullet: ${bullet}

Job Description: ${jd}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI API error: ${errText}`);
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const result = JSON.parse(content);

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    await sb.from("optimizations").insert({
      user_id: userId || null,
      input_bullet: bullet,
      input_jd: jd,
      optimized_bullet: result.optimized_bullet,
      match_score: result.match_score,
      missing_keywords: result.missing_keywords,
      suggested_verbs: result.suggested_verbs,
      alt_a: result.alt_a,
      alt_b: result.alt_b,
    }).throwOnError();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
