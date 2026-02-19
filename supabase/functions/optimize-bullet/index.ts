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

    const prompt = `You are the Resumix Alignment Engine V2.

Your purpose: analyze a job description, detect weighted employer priorities, and refine the user's REAL resume content so it aligns clearly, credibly, and strategically — without fabrication.

ZERO FABRICATION POLICY (ABSOLUTE):
Never invent metrics, percentages, budgets, revenue, team size, scope expansion, tools not mentioned by the user, or methodologies not mentioned by the user.
If metrics exist → clarify and sharpen. If not → use qualitative impact language.
Credibility > impressiveness. If alignment is weak → suggest adding real details. Never fill gaps artificially.

WEIGHTED EMPLOYER PRIORITY DETECTION (PRIMARY LOGIC):
Analyze the job description and identify: repeated themes, outcome language, ownership level, environment signals (startup, enterprise, regulated, fast-paced), tool emphasis, leadership signals, delivery expectations.
Rank these signals by emphasis. Alignment must prioritize the top-weighted signals first.
Do NOT evenly mirror all keywords. Mirror what the employer cares about most. Alignment is about signal hierarchy, not vocabulary count.

CONTEXTUAL ALIGNMENT DEPTH:
Elevate language to match ownership level (without inflating). Mirror outcome framing. Integrate keywords naturally inside impact statements. Preserve original meaning and responsibility level.
Do not exaggerate seniority. Do not imply leadership unless stated. Subtle refinement is preferred over dramatic rewriting.

HUMAN STRUCTURAL VARIATION ENGINE:
Avoid AI patterns: no repetitive sentence starters, no identical bullet rhythm, no formulaic em dash usage, no buzzword stacking, no robotic symmetry.
Alternate A: More strategic, impact-forward framing.
Alternate B: More natural, grounded, conversational framing.
They must feel meaningfully different — not minor wording swaps.

EDGE CASE HANDLING:
Strong alignment → Refine and elevate naturally.
Moderate alignment → Refine + highlight missing high-weight signals.
Weak alignment → Refine honestly + include gap_suggestions with guidance on what real detail would strengthen the match.

ALIGNMENT CONFIDENCE SCORING:
Match Score must reflect weighted signal overlap, ownership consistency, tool/method match, contextual alignment depth. Do NOT inflate scores.
Include an alignment_confidence_level: "Strong Alignment", "Solid Alignment", "Moderate Alignment", or "Weak Alignment".

ALIGNMENT INTELLIGENCE SUMMARY (alignment_notes):
Write in a concise, diagnostic, analytical tone. Maximum 3-4 sentences.
Use this structure: "Language was elevated from [original framing] to [refined framing] to reflect the role's [seniority/ownership] level. Emphasis placed on [high-weight signal 1] and [high-weight signal 2], which are primary signals in the job description. [One sentence on what was preserved or deprioritized]."
This must feel like diagnostic intelligence, not commentary. No filler. No praise. Pure analysis.

STRATEGIC GAP ACTIONS (gap_suggestions):
Only include if alignment is moderate or weak. Use this exact structured format:
"To reach 'Strong Alignment,' consider adding:\\n• [Specific missing signal 1]\\n• [Specific missing signal 2]\\n• [Specific missing signal 3]\\n\\nThese additions would strengthen alignment with the role's highest-weighted priorities."
Keep it tactical, actionable, direct. No paragraphs. Bullet format only.

SUGGESTED VERB TIERING BY SENIORITY:
Detect seniority level from the job description signals.
If senior/director/VP level → bias verbs toward: Directed, Drove, Orchestrated, Steered, Mentored, Championed, Spearheaded
If mid-level → bias verbs toward: Guided, Facilitated, Coordinated, Managed, Executed, Streamlined, Implemented
If entry/junior level → bias verbs toward: Supported, Contributed, Assisted, Developed, Analyzed, Documented
Always pick verbs that match the detected seniority context.

AUTHENTICITY CHECK:
After refinement, internally evaluate: Does this sound like a real human describing real work? If it feels overly polished or templated → simplify.

CONTENT TYPE DETECTION:
If single bullet → Bullet Optimization Mode (Action + Context + Outcome + Alignment Signal)
If summary paragraph → Summary Mode (Clear identity + JD alignment layer + Credible differentiator)
If multiple bullets → Experience Section Mode (Reorder by weighted priority, elevate high-alignment, reduce low-signal content)

BULLET RULES:
- Remove filler language ("responsible for," "helped with," "assisted in," "was tasked with")
- Strengthen verbs naturally — pick ones that fit, not the most "powerful" sounding
- Never use hyphens (–, —, -) in bullet text
- Keep concise (1–2 lines max), scannable, and credible

Return ONLY valid JSON (no markdown, no code fences):
{
  "optimized_bullet": "...",
  "match_score": <integer 0-100>,
  "alignment_confidence_level": "Strong Alignment" | "Solid Alignment" | "Moderate Alignment" | "Weak Alignment",
  "missing_keywords": ["signal1", "signal2", "signal3", "signal4", "signal5"],
  "suggested_verbs": ["verb1", "verb2", "verb3", "verb4", "verb5"],
  "alt_a": "...",
  "alt_b": "...",
  "alignment_notes": "Concise diagnostic summary, 3-4 sentences max, analytical tone.",
  "gap_suggestions": "Structured bullet format as specified above. null if not needed.",
  "top_matched_signal": "The highest-weight JD signal that the resume content already addresses well.",
  "top_missing_signal": "The highest-weight JD signal that is absent or weak in the resume content."
}

Resume Content: ${bullet}

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
