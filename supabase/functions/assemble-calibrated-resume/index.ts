import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Phase 1: Assemble structure from existing signal data (no API call) ───

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

    if (/^(professional\s+)?summary/i.test(trimmed)) { currentSection = "summary"; continue; }
    if (/^(professional\s+)?experience|^work\s+history/i.test(trimmed)) { currentSection = "experience"; continue; }
    if (/^education/i.test(trimmed)) { currentSection = "education"; continue; }
    if (/^(core\s+)?skills|^technical\s+skills|^competencies|^core\s+competencies/i.test(trimmed)) { currentSection = "skills"; continue; }
    if (/^certifications?/i.test(trimmed)) { currentSection = "certifications"; continue; }
    if (/^(independent\s+)?projects?/i.test(trimmed)) { currentSection = "projects"; continue; }

    switch (currentSection) {
      case "summary":
        result.summary += (result.summary ? " " : "") + trimmed;
        break;
      case "experience": {
        if (dateRx.test(trimmed)) {
          if (currentExp) result.experience.push(currentExp);
          const dateMatch = trimmed.match(dateRx);
          currentExp = {
            company: "",
            title: trimmed.replace(dateRx, "").replace(/[|—–,]\s*$/, "").trim(),
            dates: dateMatch ? dateMatch[0] : "",
            bullets: [],
          };
        } else if (currentExp && /^[-•▪►]/.test(trimmed)) {
          currentExp.bullets.push(trimmed.replace(/^[-•▪►]\s*/, ""));
        } else if (currentExp && trimmed.length > 20) {
          // Could be a company name or a bullet without marker
          if (!currentExp.company && trimmed.length < 60 && !dateRx.test(trimmed)) {
            currentExp.company = trimmed;
          } else {
            currentExp.bullets.push(trimmed);
          }
        }
        break;
      }
      case "education":
        result.education.push({ institution: trimmed, degree: "", year: "" });
        break;
      case "skills":
        result.skills.push(...trimmed.split(/[,•|]/).map((s: string) => s.trim()).filter(Boolean));
        break;
      case "certifications":
        result.certifications.push(trimmed.replace(/^[-•▪►]\s*/, ""));
        break;
      case "projects": {
        // Simple: treat each line as a project entry
        result.independentProjects.push({ name: trimmed, description: "", bullets: [] });
        break;
      }
    }
  }
  if (currentExp) result.experience.push(currentExp);
  return result;
}

function assembleStructureFromSignalData(directorResult: any, originalResume: string) {
  const report = directorResult;
  const header = extractHeaderFromResume(originalResume);

  let experience: any[] = [];
  let summary = "";
  let coreCompetencies: string[] = [];
  let skills: string[] = [];
  let certifications: string[] = [];
  let education: any[] = [];
  let independentProjects: any[] = [];
  let signalKeywords: string[] = [];

  // Parse from export_builder or original resume
  const textToParse = report.export_builder?.final_resume_text || originalResume;
  if (textToParse) {
    const parsed = parseResumeTextIntoSections(textToParse);
    experience = parsed.experience;
    summary = parsed.summary;
    education = parsed.education;
    skills = parsed.skills;
    certifications = parsed.certifications;
    independentProjects = parsed.independentProjects;
  }

  // Core competencies from signal classifier
  if (report.signal_classifier?.dimension_scores) {
    const dims = Object.keys(report.signal_classifier.dimension_scores);
    coreCompetencies = dims.slice(0, 12).map((d: string) =>
      d.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    );
  }

  // Signal keywords
  if (report.gap_analyzer?.rewrite_targets?.length) {
    const types = report.gap_analyzer.rewrite_targets
      .map((t: any) => t.upgrade_type)
      .filter(Boolean);
    signalKeywords = [...new Set(types)].map((t: string) =>
      t.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    );
  }

  // Merge rewritten bullets into experience
  if (report.gap_analyzer?.rewrite_targets?.length && experience.length > 0) {
    const rewrites = report.gap_analyzer.rewrite_targets;
    for (const rw of rewrites) {
      if (!rw.version_a && !rw.rewritten_bullet) continue;
      const rewrittenText = rw.version_a || rw.rewritten_bullet || "";
      const originalRef = (rw.bullet_reference || "").toLowerCase().slice(0, 60);

      for (const exp of experience) {
        for (let bi = 0; bi < exp.bullets.length; bi++) {
          if (exp.bullets[bi].toLowerCase().slice(0, 60) === originalRef) {
            exp.bullets[bi] = rewrittenText;
            break;
          }
        }
      }
    }
  }

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
  };
}

// ─── Phase 2: Focused sectional API calls ───

async function generateSummary(
  originalSummary: string,
  directorResult: any,
  originalResume: string,
  apiKey: string,
  requestId: string,
): Promise<string> {
  const context = [
    `Original summary: ${originalSummary}`,
    directorResult.signal_classifier ? `Target level: ${directorResult.signal_classifier.target_level_inferred}` : "",
    directorResult.signal_classifier ? `Alignment: ${directorResult.signal_classifier.overall_seniority_alignment}` : "",
    directorResult.director_signal_tier ? `Signal tier: ${directorResult.director_signal_tier.tier}` : "",
    `First 2000 chars of resume:\n${originalResume.slice(0, 2000)}`,
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        temperature: 0,
        system: "Rewrite the professional summary for signal alignment with the target role level. Keep it 2-4 sentences. Do not fabricate experience. Return ONLY the summary text, no JSON, no quotes.",
        messages: [{ role: "user", content: context }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error(`[assemble] [${requestId}] Summary API error: ${response.status}`);
      return originalSummary;
    }
    const data = await response.json();
    return data.content?.[0]?.text?.trim() || originalSummary;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[assemble] [${requestId}] Summary generation failed: ${err.message}`);
    return originalSummary;
  }
}

async function rewriteExperienceBullets(
  experience: any[],
  directorResult: any,
  apiKey: string,
  requestId: string,
): Promise<any[]> {
  if (experience.length === 0) return experience;

  // Build compact context
  const expText = experience.map((exp: any, i: number) => {
    const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
    const bullets = exp.bullets.map((b: string) => `  • ${b}`).join("\n");
    return `[${i}] ${header}\n${bullets}`;
  }).join("\n\n");

  const signalContext = directorResult.signal_classifier
    ? `Target: ${directorResult.signal_classifier.target_level_inferred}. Alignment: ${directorResult.signal_classifier.overall_seniority_alignment}.`
    : "";

  const gapContext = directorResult.gap_analyzer?.rewrite_targets?.length
    ? `Priority gaps: ${directorResult.gap_analyzer.priority_order?.join(", ") || "none"}`
    : "";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature: 0,
        system: `Rewrite resume experience bullets for signal optimization. Elevate ownership language, add outcome framing, and strengthen authority signals. Do NOT fabricate metrics, titles, or responsibilities. Only reframe existing content.

${signalContext}
${gapContext}

Return ONLY valid JSON array matching:
[{"company":"","title":"","dates":"","bullets":["..."]}]

Keep ALL roles. Keep ALL bullets (rewritten). Preserve company names, titles, and dates exactly.`,
        messages: [{ role: "user", content: expText }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error(`[assemble] [${requestId}] Experience API error: ${response.status}`);
      return experience;
    }
    const data = await response.json();
    const raw = data.content?.[0]?.text || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : experience;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[assemble] [${requestId}] Experience rewrite failed: ${err.message}`);
    return experience;
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
    } catch {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "BAD_REQUEST", message: "Invalid request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { directorResult, originalResume } = body;

    if (!directorResult) {
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "MISSING_INPUT", message: "Signal Positioning Report data is required." }),
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

    // ── Phase 1: Instant structure from existing signal data ──
    console.log(`[assemble] [${request_id}] Phase 1: Building structure`);
    let structure;
    try {
      structure = assembleStructureFromSignalData(directorResult, originalResume || "");
    } catch (err: any) {
      console.error(`[assemble] [${request_id}] Phase 1 failed:`, err.message);
      return new Response(
        JSON.stringify({ status: "error", request_id, error_code: "PHASE1_ERROR", message: "Failed to assemble resume structure." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[assemble] [${request_id}] Phase 1 complete: ${structure.experience.length} roles, summary ${structure.summary.length} chars`);

    // ── Phase 2: Sequential focused API calls ──
    // 2a: Rewrite summary (small, fast)
    console.log(`[assemble] [${request_id}] Phase 2a: Rewriting summary`);
    const rewrittenSummary = await generateSummary(
      structure.summary, directorResult, originalResume || "", ANTHROPIC_API_KEY, request_id
    );

    // 2b: Rewrite experience bullets (larger but focused)
    console.log(`[assemble] [${request_id}] Phase 2b: Rewriting experience bullets`);
    const rewrittenExperience = await rewriteExperienceBullets(
      structure.experience, directorResult, ANTHROPIC_API_KEY, request_id
    );

    // ── Merge results ──
    const result = normalizeResult({
      ...structure,
      summary: rewrittenSummary,
      experience: rewrittenExperience,
    });

    console.log(`[assemble] [${request_id}] Assembly complete`);
    return new Response(
      JSON.stringify({ status: "ok", request_id, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error(`[assemble] [${request_id}] Unhandled error:`, err);
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
