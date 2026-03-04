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
    const timeout = setTimeout(() => controller.abort(), 120000);
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

function sanitizeInput(input: string): string {
  return input
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/you\s+are\s+now\s+/gi, "")
    .replace(/act\s+as\s+/gi, "")
    .replace(/pretend\s+(you\s+are|to\s+be)\s+/gi, "")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { roles, jd, matchScore, existingSummary, skills, certifications } = body;

    if (!roles || !Array.isArray(roles) || roles.length === 0 || !jd) {
      return new Response(JSON.stringify({ error: "Missing required fields: roles array and jd." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const cleanJd = sanitizeInput(jd);

    // Build structured roles description for the prompt
    const rolesDescription = roles.map((r: { company: string; title: string; date_range: string; bullets: string[] }, i: number) => {
      const header = [r.company, r.title, r.date_range].filter(Boolean).join(" | ");
      const bulletList = (r.bullets || []).map((b: string, bi: number) => `  ${bi + 1}. ${sanitizeInput(b)}`).join("\n");
      return `ROLE ${i + 1}: ${header || "Untitled Role"}\n${bulletList}`;
    }).join("\n\n");

    const prompt = `You are a professional resume calibration engine. You will receive structured resume roles with individual bullets, plus a target job description.

YOUR TASK:
1. Infer the target role title and seniority from the JD.
2. Generate a calibrated PROFESSIONAL SUMMARY (3-4 sentences, third person, institutional voice, signal-calibrated to the JD).
3. For EACH role, calibrate EACH bullet individually through the signal engine. Preserve the original role structure — do NOT merge bullets across roles.
4. Generate an INTERVIEW PREPARATION NOTICE (2-3 sentences identifying remaining perception gaps after calibration).

CALIBRATION RULES (Pinnacle Filter):
- Never fabricate skills, metrics, tools, certifications, or responsibilities not present in the original.
- Lead with evidence before claims — numbers, systems, ownership, outcomes first.
- Use operational language: what was built, owned, fixed, decided.
- Never use: "results-driven", "leveraging synergies", "passionate about", "dynamic environment", "fast-paced team".
- Vary sentence cadence — no symmetrical bullet structures.
- Each bullet must be 1-2 lines max (under 35 words).
- Write like a capable professional explaining work to a peer.

INPUTS:
${rolesDescription}

${existingSummary ? `EXISTING SUMMARY: ${sanitizeInput(existingSummary)}` : ""}
${skills ? `SKILLS/COMPETENCIES: ${sanitizeInput(skills)}` : ""}
${certifications ? `CERTIFICATIONS: ${sanitizeInput(certifications)}` : ""}

JOB DESCRIPTION: ${cleanJd}

MATCH SCORE: ${matchScore || "N/A"}%

Return ONLY this JSON (no markdown, no code fences):
{
  "positioning_statement": "string (3-4 sentence professional summary)",
  "interview_preparation_notice": "string (2-3 sentences on remaining gaps)",
  "calibrated_roles": [
    {
      "company": "string",
      "title": "string",
      "date_range": "string",
      "calibrated_bullets": ["string (each bullet individually calibrated)"]
    }
  ]
}

CRITICAL: calibrated_roles must have the SAME number of roles as the input, in the SAME order. Each role must have the SAME number of bullets as the input role.`;

    let content = await callAI(apiKey, prompt);
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("JSON parse failed:", content.slice(0, 500));
      throw new Error("Failed to parse AI response.");
    }

    // Validate structure
    if (!parsed.positioning_statement || !parsed.calibrated_roles || !Array.isArray(parsed.calibrated_roles)) {
      throw new Error("Invalid AI response structure.");
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
