import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Phase 1: Assemble structure from existing signal data (no API call) ───

function assembleStructureFromSignalData(directorResult: any, originalResume: string) {
  const report = directorResult;

  // Extract header from original resume via simple heuristics
  const header = extractHeaderFromResume(originalResume);

  // Pull experience from export_builder or gap_analyzer
  let experience: any[] = [];
  let summary = "";
  let coreCompetencies: string[] = [];
  let skills: string[] = [];
  let certifications: string[] = [];
  let education: any[] = [];
  let independentProjects: any[] = [];
  let signalKeywords: string[] = [];

  // Extract from export_builder final resume if available
  if (report.export_builder?.final_resume_text) {
    const parsed = parseResumeTextIntoSections(report.export_builder.final_resume_text);
    experience = parsed.experience;
    summary = parsed.summary;
    education = parsed.education;
    skills = parsed.skills;
    certifications = parsed.certifications;
    independentProjects = parsed.independentProjects;
  }

  // Core competencies from signal classifier dimensions
  if (report.signal_classifier?.dimension_scores) {
    const dims = Object.keys(report.signal_classifier.dimension_scores);
    coreCompetencies = dims.slice(0, 12).map((d: string) => d.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()));
  }

  // Signal keywords from various sources
  if (report.signal_classifier?.dimension_scores) {
    const allRationales = Object.values(report.signal_classifier.dimension_scores)
      .map((v: any) => v.rationale || "")
      .filter(Boolean);
    // Extract key terms
    signalKeywords = allRationales.slice(0, 10);
  }

  // Get rewrite targets for Phase 2
  const rewriteTargets = report.gap_analyzer?.rewrite_targets || [];

  return {
    header,
    summary,
    core_competencies: coreCompetencies,
    experience,
    independent_projects: independentProjects,
    skills,
    certifications,
    education,
    signal_keywords: signalKeywords,
    _rewriteTargets: rewriteTargets,
  };
}

function extractHeaderFromResume(text: string): any {
  const header = { name: "", title: "", email: "", phone: "", linkedin: "", location: "" };
  if (!text) return header;

  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const emailRx = /[\w.+-]+@[\w.-]+\.\w{2,}/;
  const phoneRx = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const locationRx = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+[A-Z]{2}(?:\s+\d{5})?$/;
  const linkedinRx = /linkedin\.com\/in\/[\w-]+/i;

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (!header.email) { const m = line.match(emailRx); if (m) header.email = m[0]; }
    if (!header.phone) { const m = line.match(phoneRx); if (m) header.phone = m[0]; }
    if (!header.linkedin) { const m = line.match(linkedinRx); if (m) header.linkedin = m[0]; }
    if (!header.location && locationRx.test(line)) header.location = line;
    if (i === 0 && line.length < 50 && !emailRx.test(line) && !phoneRx.test(line)) {
      header.name = line;
    }
  }
  return header;
}

function parseResumeTextIntoSections(text: string): any {
  const lines = text.split("\n");
  const result: any = { experience: [], summary: "", education: [], skills: [], certifications: [], independentProjects: [] };
  
  let currentSection = "";
  let currentExp: any = null;
  const dateRx = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(\d{4})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(present|current|\d{4})/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (/^(professional\s+)?summary/i.test(trimmed)) { currentSection = "summary"; continue; }
    if (/^(professional\s+)?experience|^work\s+history/i.test(trimmed)) { currentSection = "experience"; continue; }
    if (/^education/i.test(trimmed)) { currentSection = "education"; continue; }
    if (/^(core\s+)?skills|^technical\s+skills|^competencies/i.test(trimmed)) { currentSection = "skills"; continue; }
    if (/^certifications?/i.test(trimmed)) { currentSection = "certifications"; continue; }
    if (/^(independent\s+)?projects?/i.test(trimmed)) { currentSection = "projects"; continue; }

    switch (currentSection) {
      case "summary":
        result.summary += (result.summary ? " " : "") + trimmed;
        break;
      case "experience": {
        if (dateRx.test(trimmed)) {
          if (currentExp) result.experience.push(currentExp);
          currentExp = { company: "", title: trimmed.replace(dateRx, "").replace(/[|—–,]\s*$/, "").trim(), dates: (trimmed.match(dateRx) || [])[0] || "", bullets: [] };
        } else if (currentExp && /^[-•]/.test(trimmed)) {
          currentExp.bullets.push(trimmed.replace(/^[-•]\s*/, ""));
        } else if (currentExp && trimmed.length > 20) {
          currentExp.bullets.push(trimmed);
        }
        break;
      }
      case "education":
        result.education.push({ institution: trimmed, degree: "", year: "" });
        break;
      case "skills":
        result.skills.push(...trimmed.split(/,\s*/).filter(Boolean));
        break;
      case "certifications":
        result.certifications.push(trimmed);
        break;
    }
  }
  if (currentExp) result.experience.push(currentExp);
  return result;
}

// ─── Phase 2: Focused API call for bullet rewrites + summary ───

async function rewriteBulletsAndSummary(
  structure: any,
  directorResult: any,
  originalResume: string,
  apiKey: string,
  requestId: string,
): Promise<any> {
  // Build a focused context — only what's needed for rewriting
  const contextParts: string[] = [];

  if (originalResume) {
    contextParts.push(`ORIGINAL RESUME TEXT:\n${originalResume.slice(0, 6000)}`);
  }

  if (directorResult.export_builder?.final_resume_text) {
    contextParts.push(`EXPORT BUILDER FINAL RESUME:\n${directorResult.export_builder.final_resume_text.slice(0, 4000)}`);
  }

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

  if (directorResult.signal_classifier) {
    const sc = directorResult.signal_classifier;
    contextParts.push(`SIGNAL CLASSIFIER:\nInferred Level: ${sc.target_level_inferred}\nOverall Alignment: ${sc.overall_seniority_alignment}`);
  }

  if (directorResult.dimensions?.length) {
    const dimText = directorResult.dimensions.map((d: any) =>
      `${d.name}: ${d.classification} | Strength: ${d.strength_signal} | Risk: ${d.risk_signal}`
    ).join("\n");
    contextParts.push(`POSITIONING DIMENSIONS:\n${dimText}`);
  }

  if (directorResult.director_signal_tier) {
    contextParts.push(`SIGNAL TIER: ${directorResult.director_signal_tier.tier}\nRationale: ${directorResult.director_signal_tier.rationale}`);
  }

  const contextPayload = contextParts.join("\n\n---\n\n");

  const systemPrompt = `You are a professional resume architect. You have been given pre-optimized resume components extracted from a deep signal analysis. Your job is to assemble them into a single coherent, ATS-optimized, professionally formatted resume. Maintain all signal-calibrated language exactly. Do not summarize or dilute any bullets. Structure the resume in this order: Header → Professional Summary → Core Competencies → Experience → Independent Projects → Skills → Certifications → Education. Return the result as structured JSON with clearly labeled sections so each section can be rendered and edited independently in the UI.

Return ONLY valid JSON matching this schema:
{
  "header": { "name": "", "title": "", "email": "", "phone": "", "linkedin": "", "location": "" },
  "summary": "",
  "core_competencies": ["", ""],
  "experience": [{ "company": "", "title": "", "dates": "", "bullets": ["", ""] }],
  "independent_projects": [{ "name": "", "description": "", "bullets": [""] }],
  "skills": ["", ""],
  "certifications": [""],
  "education": [{ "institution": "", "degree": "", "year": "" }],
  "signal_keywords": ["", ""]
}

Rules:
- Extract header info (name, email, phone, location, linkedin) from the original resume text
- Use the optimized/rewritten bullets where available, falling back to originals
- Apply signal-calibrated language to the Professional Summary
- Core competencies should be 8-12 key skill/domain terms
- Include ALL experience sections with calibrated bullet points
- Include Independent Projects if present
- Extract and list all Skills organized by relevance
- Include all Certifications
- Signal keywords should be the top 8-10 terms the role screens for
- Do not fabricate any experience, metrics, or claims
- If a section has no content, return an empty array
- If a field cannot be determined, use empty string
- Return ONLY valid JSON, no markdown, no code fences`;

  // 25-second timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    console.log(`[assemble-calibrated-resume] [${requestId}] Phase 2: Calling Anthropic API`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: contextPayload }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[assemble-calibrated-resume] [${requestId}] AI gateway error: ${response.status}`, errText);

      if (response.status === 429) {
        return { error: true, error_code: "RATE_LIMIT", message: "Rate limit exceeded. Please try again in a moment." };
      }
      return { error: true, error_code: "AI_ERROR", message: `Resume assembly failed (${response.status}). Please retry.` };
    }

    console.log(`[assemble-calibrated-resume] [${requestId}] Phase 2: API response received`);

    let aiData;
    try {
      aiData = await response.json();
    } catch (parseErr) {
      console.error(`[assemble-calibrated-resume] [${requestId}] Failed to parse API response JSON`);
      return { error: true, error_code: "RESPONSE_PARSE_ERROR", message: "Failed to read AI response." };
    }

    const rawContent = aiData.content?.[0]?.text || "";

    let assembled;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      assembled = JSON.parse(cleaned);
    } catch {
      console.error(`[assemble-calibrated-resume] [${requestId}] JSON parse failed:`, rawContent.slice(0, 500));
      return { error: true, error_code: "PARSE_ERROR", message: "Resume assembly returned invalid format. Please retry." };
    }

    console.log(`[assemble-calibrated-resume] [${requestId}] Phase 2: Successfully parsed result`);
    return { error: false, data: assembled };

  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.error(`[assemble-calibrated-resume] [${requestId}] Phase 2: Timed out after 25s`);
      return { error: true, error_code: "TIMEOUT", message: "Still building your resume — this section took longer than expected. Please retry.", retry: true };
    }

    console.error(`[assemble-calibrated-resume] [${requestId}] Phase 2: Unexpected error:`, err.message);
    return { error: true, error_code: "FETCH_ERROR", message: err.message || "Network error during assembly." };
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const request_id = crypto.randomUUID();

  try {
    let body;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error(`[assemble-calibrated-resume] [${request_id}] Failed to parse request body`);
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "BAD_REQUEST", message: "Invalid request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { directorResult, originalResume } = body;

    if (!directorResult) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "MISSING_INPUT", message: "Signal Positioning Report data is required to assemble the resume." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate required sections
    const report = directorResult;
    const hasGapAnalyzer = report.gap_analyzer?.rewrite_targets?.length > 0;
    const hasExportBuilder = !!report.export_builder?.final_resume_text;
    const hasSignalClassifier = !!report.signal_classifier;
    const hasDimensions = report.dimensions?.length > 0;

    if (!hasGapAnalyzer && !hasExportBuilder && !hasSignalClassifier && !hasDimensions) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "INCOMPLETE_REPORT", message: "Signal Positioning Report must be generated before assembling the Calibrated Resume." }),
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

    // ── Phase 1: Assemble structure from existing data (instant) ──
    console.log(`[assemble-calibrated-resume] [${request_id}] Phase 1: Assembling structure from signal data`);
    let structure;
    try {
      structure = assembleStructureFromSignalData(directorResult, originalResume || "");
    } catch (err: any) {
      console.error(`[assemble-calibrated-resume] [${request_id}] Phase 1 failed:`, err.message);
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "PHASE1_ERROR", message: "Failed to assemble resume structure." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[assemble-calibrated-resume] [${request_id}] Phase 1: Complete`);

    // ── Phase 2: Focused API call for polished output ──
    console.log(`[assemble-calibrated-resume] [${request_id}] Phase 2: Starting API call`);
    const phase2Result = await rewriteBulletsAndSummary(structure, directorResult, originalResume || "", ANTHROPIC_API_KEY, request_id);

    if (phase2Result.error) {
      // On timeout, return Phase 1 structure as partial result
      if (phase2Result.error_code === "TIMEOUT") {
        console.log(`[assemble-calibrated-resume] [${request_id}] Returning Phase 1 partial result due to timeout`);
        const { _rewriteTargets, ...partialResult } = structure;
        return new Response(
          JSON.stringify({
            status: "partial",
            request_id,
            retry: true,
            message: "Still building your resume — this section took longer than expected, retrying...",
            ...normalizeResult(partialResult),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: phase2Result.error_code, message: phase2Result.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Merge Phase 2 result ──
    const assembled = phase2Result.data;
    const result = normalizeResult(assembled);

    console.log(`[assemble-calibrated-resume] [${request_id}] Assembly complete`);
    return new Response(
      JSON.stringify({ status: "ok", request_id, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error(`[assemble-calibrated-resume] [${request_id}] Unhandled error:`, err);
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

function normalizeResult(assembled: any) {
  return {
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
}
