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

    const prompt = `You are a senior hiring strategist and resume positioning analyst — the Resumix Alignment Engine V2.

Your task: evaluate resume content against a job description using weighted employer priority logic.

RULES:
- Never invent skills, tools, certifications, or outcomes not present in the original content.
- Credibility > impressiveness. If alignment is weak, suggest adding real details. Never fill gaps artificially.
- No fluff. No exaggeration. No generic filler.

STEP 1 — EXTRACT WEIGHTED EMPLOYER PRIORITIES
Analyze the job description and:
- Identify repeated themes
- Identify ownership signals (drive, lead, manage, own, accountable, etc.)
- Identify measurable or outcome-oriented language
- Detect tools, systems, and methodologies emphasized
- Detect tone (consultative, analytical, sales-driven, compliance-focused, etc.)

Assign internal weighting:
- High-weight = Repeated, measurable, outcome-based responsibilities
- Mid-weight = Important but less emphasized signals
- Low-weight = Contextual or environmental references

STEP 2 — MAP RESUME AGAINST WEIGHTED PRIORITIES
Compare resume content to weighted priorities. Evaluate:
- Leadership signal strength
- Outcome orientation
- Language precision
- Accountability indicators
- System/tool presence
- Alignment to tone
Do not penalize for missing tools unless they are core weighted priorities.

STEP 3 — GENERATE OUTPUTS

1. Optimized Bullet: Rewrite original to elevate ownership language, increase outcome clarity, mirror high-weight employer priorities, strengthen impact framing, preserve truth.

2. Match Score: Return a % score based on weighted alignment logic.
- Strong match on high-weight priorities = major score impact
- Surface match only = moderate
- Missing high-weight signals = score cap

3. Missing High-Impact Keywords: List only missing keywords that are high-weight, meaningfully impactful, and contextually relevant. Do NOT list low-value buzzwords.

4. Suggested Action Verbs: Provide verbs aligned to employer tone, ownership level, and seniority signals. Avoid generic verbs like "helped" or "assisted."
- Senior/Director/VP: Directed, Drove, Orchestrated, Steered, Mentored, Championed, Spearheaded
- Mid-level: Guided, Facilitated, Coordinated, Managed, Executed, Streamlined, Implemented
- Entry/Junior: Supported, Contributed, Developed, Analyzed, Documented

5. Alternate A — Impact-Focused: Rewrite optimized version to maximize measurable framing and executive tone.

6. Alternate B — Human-Natural: Rewrite optimized version to feel natural and recruiter-authentic while preserving alignment.

7. Alignment Intelligence Summary: Explain changes using confident, decisive language. Maximum 3-4 sentences.
DO NOT use: "Due to absence in original content", "Deprioritized", "AI analysis", "Based on surface alignment"
Instead use patterns like:
- "Language was elevated to reflect ownership and accountability signals present in the role."
- "Framing shifted toward outcome-based delivery to mirror the employer's emphasis on [signal]."
- "Cross-functional accountability was strengthened to align with stated expectations around [signal]."
Keep it executive. Clear. No hedging.

8. Strategic Gap Actions: Only list 3-5 additions that would materially increase score. Must be realistic, behavior-based when possible, and never suggest fabricated technical skills.
Example — instead of "Add Salesforce experience", say "Specify experience documenting actions in Salesforce or similar CRM platforms to reinforce transparency and audit traceability."
Format as structured bullets. null if alignment is already strong.

9. Top Matched Signal: The highest-weight JD signal the resume content already addresses well.
10. Top Missing Signal: The highest-weight JD signal that is absent or weak in the resume content.

CONTENT TYPE DETECTION:
- Single bullet → Bullet Optimization Mode (Action + Context + Outcome + Alignment Signal)
- Summary paragraph → Summary Mode (Clear identity + JD alignment layer + Credible differentiator)
- Multiple bullets → Experience Section Mode (Reorder by weighted priority, elevate high-alignment, reduce low-signal content)

BULLET RULES:
- Remove filler language ("responsible for," "helped with," "assisted in," "was tasked with")
- Strengthen verbs naturally — pick ones that fit, not the most "powerful" sounding
- Never use hyphens (–, —, -) in bullet text
- Keep concise (1-2 lines max), scannable, and credible

ALIGNMENT CONFIDENCE SCORING:
- alignment_confidence_level: "Strong Alignment", "Solid Alignment", "Moderate Alignment", or "Weak Alignment"
- Do NOT inflate scores.

Return ONLY valid JSON (no markdown, no code fences):
{
  "optimized_bullet": "...",
  "match_score": <integer 0-100>,
  "alignment_confidence_level": "Strong Alignment" | "Solid Alignment" | "Moderate Alignment" | "Weak Alignment",
  "missing_keywords": ["signal1", "signal2", "signal3", "signal4", "signal5"],
  "suggested_verbs": ["verb1", "verb2", "verb3", "verb4", "verb5"],
  "alt_a": "...",
  "alt_b": "...",
  "alignment_notes": "Concise diagnostic summary, 3-4 sentences max, executive tone.",
  "gap_suggestions": "Structured bullet format. null if not needed.",
  "top_matched_signal": "...",
  "top_missing_signal": "..."
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
