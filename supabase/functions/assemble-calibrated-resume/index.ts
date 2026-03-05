import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const request_id = crypto.randomUUID();

  try {
    const body = await req.json();
    const { directorResult, originalResume } = body;

    if (!directorResult) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "MISSING_INPUT", message: "Signal Positioning Report data is required to assemble the resume." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate required sections exist before attempting assembly
    const report = directorResult;
    const hasGapAnalyzer = report.gap_analyzer?.rewrite_targets?.length > 0;
    const hasExportBuilder = !!report.export_builder?.final_resume_text;
    const hasSignalClassifier = !!report.signal_classifier;
    const hasDimensions = report.dimensions?.length > 0;

    if (!hasGapAnalyzer && !hasExportBuilder && !hasSignalClassifier && !hasDimensions) {
      return new Response(
        JSON.stringify({
          status: "error",
          request_id,
          error_code: "INCOMPLETE_REPORT",
          message: "Signal Positioning Report must be generated before assembling the Calibrated Resume. Missing required analysis sections.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "CONFIG_ERROR", message: "AI gateway not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the context payload from director result sections
    const contextParts: string[] = [];

    // Header / contact from original resume
    if (originalResume) {
      contextParts.push(`ORIGINAL RESUME TEXT:\n${originalResume.slice(0, 6000)}`);
    }

    // Section 6: Optimized Summary (from gap_analyzer or export_builder)
    if (directorResult.export_builder?.final_resume_text) {
      contextParts.push(`EXPORT BUILDER FINAL RESUME:\n${directorResult.export_builder.final_resume_text.slice(0, 4000)}`);
    }

    // Section 7: Bullet Rewrites from gap_analyzer
    if (directorResult.gap_analyzer?.rewrite_targets?.length) {
      const rewrites = directorResult.gap_analyzer.rewrite_targets.map((t: any, i: number) => {
        const lines = [`${i + 1}. Original: ${t.bullet_reference}`];
        if (t.version_a) lines.push(`   Version A: ${t.version_a}`);
        if (t.version_b) lines.push(`   Version B: ${t.version_b}`);
        if (t.rewritten_bullet) lines.push(`   Rewritten: ${t.rewritten_bullet}`);
        return lines.join("\n");
      });
      contextParts.push(`BULLET REWRITES:\n${rewrites.join("\n\n")}`);
    }

    // Section 1: Role DNA / Signal Classifier keywords
    if (directorResult.signal_classifier) {
      const sc = directorResult.signal_classifier;
      contextParts.push(`SIGNAL CLASSIFIER:\nInferred Level: ${sc.target_level_inferred}\nOverall Alignment: ${sc.overall_seniority_alignment}`);

      // Extract top dimension keywords
      if (sc.dimension_scores) {
        const dims = Object.entries(sc.dimension_scores).map(([key, val]: [string, any]) => {
          return `${key}: ${val.score}/25 — ${val.rationale || ""}`;
        });
        contextParts.push(`DIMENSION SCORES:\n${dims.join("\n")}`);
      }
    }

    // Dimensions
    if (directorResult.dimensions?.length) {
      const dimText = directorResult.dimensions.map((d: any) =>
        `${d.name}: ${d.classification} | Strength: ${d.strength_signal} | Risk: ${d.risk_signal}`
      ).join("\n");
      contextParts.push(`POSITIONING DIMENSIONS:\n${dimText}`);
    }

    // Director Signal Tier
    if (directorResult.director_signal_tier) {
      contextParts.push(`SIGNAL TIER: ${directorResult.director_signal_tier.tier}\nRationale: ${directorResult.director_signal_tier.rationale}`);
    }

    const contextPayload = contextParts.join("\n\n---\n\n");

    const systemPrompt = `You are a professional resume architect. You have been given pre-optimized resume components extracted from a deep signal analysis. Your job is to assemble them into a single coherent, ATS-optimized, professionally formatted resume. Maintain all signal-calibrated language exactly. Do not summarize or dilute any bullets. Structure the resume in this order: Header → Professional Summary → Core Competencies → Experience → Independent Projects → Skills → Certifications → Education. Return the result as structured JSON with clearly labeled sections so each section can be rendered and edited independently in the UI.

Return ONLY valid JSON matching this schema:
{
  "header": {
    "name": "",
    "title": "",
    "email": "",
    "phone": "",
    "linkedin": "",
    "location": ""
  },
  "summary": "",
  "core_competencies": ["", ""],
  "experience": [
    {
      "company": "",
      "title": "",
      "dates": "",
      "bullets": ["", ""]
    }
  ],
  "independent_projects": [
    {
      "name": "",
      "description": "",
      "bullets": [""]
    }
  ],
  "skills": ["", ""],
  "certifications": [""],
  "education": [
    {
      "institution": "",
      "degree": "",
      "year": ""
    }
  ],
  "signal_keywords": ["", ""]
}

Rules:
- Extract header info (name, email, phone, location, linkedin) from the original resume text
- Use the optimized/rewritten bullets where available, falling back to originals
- Apply signal-calibrated language to the Professional Summary — rewrite it to align with the target JD's signal dimensions
- Core competencies should be 8-12 key skill/domain terms extracted from the signal analysis
- Include ALL experience sections from the original resume with role/company/dates as structured headers and calibrated bullet points
- Include Independent Projects if present in the original resume (side projects, open source, freelance)
- Extract and list all Skills from the resume, organized by relevance to the target role
- Include all Certifications mentioned in the original resume
- Signal keywords should be the top 8-10 terms the role is screening for
- Do not fabricate any experience, metrics, or claims
- If a section has no content, return an empty array
- If a field cannot be determined, use empty string
- Return ONLY valid JSON, no markdown, no code fences`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: "user", content: contextPayload },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[assemble-calibrated-resume] AI gateway error: ${response.status}`, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ status: "error", request_id, error_code: "RATE_LIMIT", message: "Rate limit exceeded. Please try again in a moment." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Let other non-429 errors fall through to the generic AI_ERROR below

      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "AI_ERROR", message: "Resume assembly failed. Please retry." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await response.json();
    const rawContent = aiData.content?.[0]?.text || "";

    // Parse JSON from response
    let assembled;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      assembled = JSON.parse(cleaned);
    } catch {
      console.error("[assemble-calibrated-resume] JSON parse failed:", rawContent.slice(0, 500));
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "PARSE_ERROR", message: "Resume assembly returned invalid format. Please retry." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Normalize the response
    const result = {
      header: {
        name: assembled.header?.name || "",
        title: assembled.header?.title || "",
        email: assembled.header?.email || "",
        phone: assembled.header?.phone || "",
        linkedin: assembled.header?.linkedin || "",
        location: assembled.header?.location || "",
      },
      summary: assembled.summary || "",
      core_competencies: Array.isArray(assembled.core_competencies) ? assembled.core_competencies : [],
      experience: Array.isArray(assembled.experience)
        ? assembled.experience.map((e: any) => ({
            company: e.company || "",
            title: e.title || "",
            dates: e.dates || "",
            bullets: Array.isArray(e.bullets) ? e.bullets : [],
          }))
        : [],
      independent_projects: Array.isArray(assembled.independent_projects)
        ? assembled.independent_projects.map((p: any) => ({
            name: p.name || "",
            description: p.description || "",
            bullets: Array.isArray(p.bullets) ? p.bullets : [],
          }))
        : [],
      skills: Array.isArray(assembled.skills) ? assembled.skills : [],
      certifications: Array.isArray(assembled.certifications) ? assembled.certifications : [],
      education: Array.isArray(assembled.education)
        ? assembled.education.map((e: any) => ({
            institution: e.institution || "",
            degree: e.degree || "",
            year: e.year || "",
          }))
        : [],
      signal_keywords: Array.isArray(assembled.signal_keywords) ? assembled.signal_keywords : [],
    };

    return new Response(
      JSON.stringify({ status: "ok", request_id, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[assemble-calibrated-resume] Error:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        request_id,
        error_code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
