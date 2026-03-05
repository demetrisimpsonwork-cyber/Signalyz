// assemble-calibrated-resume v2.1
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
        result.independentProjects.push({ name: trimmed, description: "", bullets: [] });
        break;
      }
    }
  }
  if (currentExp) result.experience.push(currentExp);
  return result;
}

function extractJDSignals(directorResult: any): string {
  const parts: string[] = [];

  // Priority signals from JD extraction
  if (directorResult.signal_classifier?.jd_signal_extraction) {
    const jd = directorResult.signal_classifier.jd_signal_extraction;
    if (jd.priority_summary) parts.push(`Employer priority: ${jd.priority_summary}`);
    if (jd.role_identity_signals?.length) parts.push(`Role signals: ${jd.role_identity_signals.join(", ")}`);
    if (jd.strategic_signals?.length) parts.push(`Strategic signals: ${jd.strategic_signals.join(", ")}`);
    if (jd.operational_signals?.length) parts.push(`Operational signals: ${jd.operational_signals.join(", ")}`);
    if (jd.leadership_signals?.length) parts.push(`Leadership signals: ${jd.leadership_signals.join(", ")}`);
  }

  // Gap priorities
  if (directorResult.gap_analyzer?.priority_order?.length) {
    parts.push(`Signal gaps to address: ${directorResult.gap_analyzer.priority_order.join(", ")}`);
  }

  // Target level
  if (directorResult.signal_classifier?.target_level_inferred) {
    parts.push(`Target level: ${directorResult.signal_classifier.target_level_inferred}`);
  }
  if (directorResult.signal_classifier?.overall_seniority_alignment) {
    parts.push(`Alignment: ${directorResult.signal_classifier.overall_seniority_alignment}`);
  }

  return parts.join("\n");
}

function reorderCompetencies(skills: string[], directorResult: any): string[] {
  if (!skills.length) return skills;

  const jdSignals: string[] = [];
  const jdExtraction = directorResult.signal_classifier?.jd_signal_extraction;
  if (jdExtraction) {
    jdSignals.push(
      ...(jdExtraction.role_identity_signals || []),
      ...(jdExtraction.strategic_signals || []),
      ...(jdExtraction.operational_signals || []),
      ...(jdExtraction.leadership_signals || []),
      ...(jdExtraction.relationship_signals || []),
    );
  }

  if (!jdSignals.length) return skills;

  const jdLower = jdSignals.map(s => s.toLowerCase());

  // Score each skill by relevance to JD signals
  const scored = skills.map(skill => {
    const skillLower = skill.toLowerCase();
    let score = 0;
    for (const sig of jdLower) {
      if (skillLower.includes(sig) || sig.includes(skillLower)) score += 3;
      // Partial word overlap
      const skillWords = skillLower.split(/\s+/);
      const sigWords = sig.split(/\s+/);
      for (const sw of skillWords) {
        if (sw.length > 3 && sigWords.some(w => w.includes(sw) || sw.includes(w))) score += 1;
      }
    }
    return { skill, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.skill);
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

  // Core competencies from signal classifier dimensions
  if (report.signal_classifier?.dimension_scores) {
    const dims = Object.keys(report.signal_classifier.dimension_scores);
    coreCompetencies = dims.slice(0, 12).map((d: string) =>
      d.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    );
  }

  // Merge skills into competencies if no dimension scores
  if (coreCompetencies.length === 0 && skills.length > 0) {
    coreCompetencies = skills.slice(0, 12);
  }

  // Reorder competencies by JD relevance
  coreCompetencies = reorderCompetencies(coreCompetencies, report);
  skills = reorderCompetencies(skills, report);

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

// ─── Phase 2: Focused sectional API calls with JD context ───

async function generateSummary(
  originalSummary: string,
  directorResult: any,
  originalResume: string,
  apiKey: string,
  requestId: string,
): Promise<string> {
  const jdSignals = extractJDSignals(directorResult);

  const context = [
    `Original summary: ${originalSummary}`,
    jdSignals ? `\nTARGET JD SIGNAL CONTEXT:\n${jdSignals}` : "",
    directorResult.director_signal_tier ? `Signal tier: ${directorResult.director_signal_tier.tier}` : "",
    `\nFirst 2000 chars of resume:\n${originalResume.slice(0, 2000)}`,
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
        system: `Rewrite this professional summary to align with the target role's hiring criteria.

RULES:
- Open with the candidate's strongest transferable identity signal that directly addresses the target role's primary hiring criteria
- Use 2-4 sentences of active voice only
- NEVER open with "Demonstrates", "Possesses", "Reflecting", "Highly accomplished", or "Dedicated experience"
- Start with a direct declarative identity statement (e.g., "Client experience operations professional with 7+ years...")
- Every sentence must reference verifiable experience from the original resume
- Incorporate the target role's language architecture naturally — not keyword stuffing
- ZERO fabrication: do not invent experience, metrics, or capabilities not present in the original

Return ONLY the summary text, no JSON, no quotes, no labels.`,
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

  const jdSignals = extractJDSignals(directorResult);

  // For each role, identify the 2-3 strongest bullets and mark them for rewrite
  const expText = experience.map((exp: any, i: number) => {
    const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
    const bullets = exp.bullets.map((b: string, bi: number) => `  [${bi}] ${b}`).join("\n");
    return `[ROLE ${i}] ${header}\n${bullets}`;
  }).join("\n\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

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
        system: `You are rewriting resume experience bullets to align with a target job description.

TARGET JD SIGNAL CONTEXT:
${jdSignals}

INSTRUCTIONS:
1. For each role, identify the 2-3 bullets with the strongest transferable signal to the target JD
2. Rewrite ONLY those high-signal bullets using the JD's language architecture — genuine reframing of actual work performed, not keyword stuffing
3. Keep remaining bullets as-is (minor polish OK but no substantive changes)
4. Preserve company names, titles, and dates EXACTLY as provided
5. ZERO FABRICATION: Do not invent metrics, titles, responsibilities, or experience not present in the original
6. Elevate ownership language and add outcome framing where the underlying work genuinely supports it

Return ONLY valid JSON array:
[{"company":"","title":"","dates":"","bullets":["..."]}]

Keep ALL roles. Keep ALL bullets. Preserve exact order.`,
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
    console.log(`[assemble] [${request_id}] Phase 1 complete: ${structure.experience.length} roles, summary ${structure.summary.length} chars, ${structure.core_competencies.length} competencies`);

    // ── Phase 2: Sequential focused API calls ──
    // 2a: Rewrite summary
    console.log(`[assemble] [${request_id}] Phase 2a: Rewriting summary`);
    const rewrittenSummary = await generateSummary(
      structure.summary, directorResult, originalResume || "", ANTHROPIC_API_KEY, request_id
    );

    // 2b: Rewrite experience bullets
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
