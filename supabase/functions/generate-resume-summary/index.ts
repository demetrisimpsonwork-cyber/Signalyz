import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-5-mini",
];

async function callAI(apiKey: string, prompt: string): Promise<string> {
  for (const model of MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (content) return content;
      }
    } catch (e) {
      clearTimeout(timeout);
      console.error(`${model} error:`, e);
    }
  }
  throw new Error("Service temporarily unavailable.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { experience, jd, calibratedBullet, matchScore } = await req.json();

    if (!experience || !jd || !calibratedBullet) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are a professional resume positioning engine. Generate TWO things based on the candidate's experience and target job description.

ANTI-FABRICATION RULE: You MUST only reference skills, experiences, outcomes, and responsibilities that are explicitly present in the EXPERIENCE_INPUT. Do NOT invent metrics, titles, tools, certifications, or responsibilities.

WRITING STYLE:
- Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment"
- Write in third person, institutional voice
- Lead with evidence, not claims
- Operational language only

TASK 1 — POSITIONING STATEMENT:
Write a 3-4 sentence professional summary in third person that positions this candidate for the target role. It must be signal-calibrated to the specific JD. Use only evidence from the experience provided.

TASK 2 — SIGNAL GAP NOTICE:
Write 2-3 sentences identifying remaining perception gaps AFTER calibration. Be specific about what signals are still missing or weak relative to the JD requirements. This is diagnostic, not promotional.

Return ONLY this JSON (no markdown, no code fences):
{
  "positioning_statement": "string",
  "signal_gap_notice": "string"
}

EXPERIENCE_INPUT: ${experience}

JOB_DESCRIPTION: ${jd}

CALIBRATED_BULLET: ${calibratedBullet}

MATCH_SCORE: ${matchScore}%`;

    let content = await callAI(apiKey, prompt);
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Failed to parse AI response.");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
