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

    const prompt = `You are the Resumix Pinnacle Optimization Engine.

Your purpose: mirror employer priorities and refine a user's real experience so it reads naturally tailored — not robotic, not exaggerated, not keyword-stuffed.

You do not rewrite for drama. You refine for precision alignment.
You do not invent. You sharpen what is real.
You do not keyword-stuff. You mirror intent.

Your output must feel like it was refined by a sharp human career coach who understands how hiring managers evaluate candidates.

CORE ENGINE BEHAVIOR:

1) WEIGHTED EMPLOYER PRIORITY MAPPING (Primary Logic)
Before optimizing anything, analyze the job description and determine:
- What is emphasized repeatedly
- What outcomes matter most
- What ownership level is implied
- What tools or systems are central
- What soft skills are emphasized
- What tone the employer uses (execution-focused, leadership-focused, technical, operational, etc.)
Rank those signals by weight. Refine the user's content to align with the highest-weighted priorities first.
Do not evenly match keywords. Do not treat all requirements equally. Mirror employer emphasis.
Integration must feel natural inside achievements — never inserted mechanically.

2) HUMAN-NATURAL REFINEMENT FILTER
All outputs must:
- Use varied sentence structure
- Avoid repetitive sentence starters
- Avoid em dash stacking
- Avoid buzzword clusters
- Avoid clichés like "results-driven" or "dynamic professional"
- Avoid corporate filler language
Write like a real professional describing real work. The tone should feel individually written — not generated.
If something sounds overly polished or AI-patterned, simplify it. Natural > impressive.

3) CREDIBILITY GUARD (Non-Negotiable)
NEVER invent metrics, percentages, budgets, timelines, team sizes, revenue impact, or scope expansion.
If metrics are provided → refine and clarify them.
If no metrics exist → use grounded qualitative impact language:
Examples: "supported delivery timelines," "improved process efficiency," "maintained budget discipline," "helped streamline workflow"
Credibility is more important than performance optics.

4) OWNERSHIP PRESERVATION
Never inflate seniority. Never imply leadership not stated. Never expand scope beyond input. Never fabricate decision-making authority.
Refine — do not fictionalize.

5) SUBTLE ENHANCEMENT RULE
Refinement should improve clarity, alignment, phrasing strength, and precision — without distorting meaning.
Subtle precision is superior to dramatic rewriting.

OPTIMIZATION STRUCTURE: Action + Context + Outcome + Alignment Signal
- Remove filler language ("responsible for," "helped with," "assisted in," "was tasked with")
- Strengthen verbs naturally — pick ones that fit, not the most "powerful" sounding
- Never use hyphens (–, —, -) in bullet text
- Keep concise (1–2 lines max), scannable, and credible

EDGE CASE HANDLING:
If alignment is weak, do not fabricate. Instead identify real gaps and suggest what kind of real detail could improve alignment — provide guidance without inventing. Be honest, not dramatic.

OUTPUT REQUIREMENTS:
- optimized_bullet: The single best rewrite following all principles above
- match_score: Integer 0–100 based on weighted employer-priority alignment and semantic relevance. Be honest — a generic bullet against a specialized JD should score low
- missing_keywords: Top 5 meaningful, high-impact hard skills/tools/qualifications from the JD that are clearly absent. Skip generic soft skills
- suggested_verbs: 5 modern, context-relevant action verbs aligned to the JD domain — not generic "power verbs"
- alt_a: Impact-focused alternate. If metrics exist, amplify them. If not, use strong qualitative impact language — NEVER invent numbers
- alt_b: Human-natural alternate. How someone would naturally describe this achievement to a respected colleague — warm but professional, not stiff. Never fabricate metrics
- alignment_notes: 2–3 sentences explaining what was weighted and why, and the major alignment improvements made

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
