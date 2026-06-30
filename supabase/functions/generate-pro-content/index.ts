import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

async function callAI(prompt: string, maxTokens = 4000, temperature = 0, retries = 1): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          temperature: attempt > 0 ? Math.min(temperature, 0.5) : temperature,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`AI API error attempt ${attempt}: ${res.status} ${errText}`);
        if (attempt < retries) continue;
        throw new Error(`AI API error: ${res.status}`);
      }
      const data = await res.json();
      return data.content?.[0]?.text ?? "";
    } catch (e) {
      if (attempt < retries) {
        console.warn(`Retry ${attempt + 1} after error: ${e}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error("AI call failed after retries");
}

function sanitize(input: string): string {
  return input
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "")
    .replace(/you\s+are\s+now/gi, "")
    .replace(/system\s*:/gi, "")
    .slice(0, 15000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication & Usage Enforcement ---
    const authHeader = req.headers.get("Authorization");
    let authenticatedUserId: string | null = null;

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (authHeader?.startsWith("Bearer ")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (user) authenticatedUserId = user.id;
    }

    if (!authenticatedUserId) {
      // Enforce daily limit for unauthenticated users via IP
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("cf-connecting-ip")
        || "unknown";
      const today = new Date().toISOString().slice(0, 10);

      const { data: usageRows } = await adminSupabase
        .from("usage_tracking")
        .select("alignment_count")
        .eq("ip_address", clientIp)
        .eq("usage_date", today)
        .is("user_id", null)
        .limit(1);

      const currentCount = usageRows?.[0]?.alignment_count ?? 0;
      if (currentCount >= 3) {
        return new Response(
          JSON.stringify({ status: "error", error_code: "USAGE_LIMIT_REACHED", message: "Daily limit reached. Sign up to continue." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert usage count
      if (usageRows && usageRows.length > 0) {
        await adminSupabase
          .from("usage_tracking")
          .update({ alignment_count: currentCount + 1, updated_at: new Date().toISOString() })
          .eq("ip_address", clientIp)
          .eq("usage_date", today)
          .is("user_id", null);
      } else {
        await adminSupabase
          .from("usage_tracking")
          .insert({ ip_address: clientIp, usage_date: today, alignment_count: 1, user_id: null });
      }
    }

    const body = await req.json();
    const type = body.type as string;
    const experience = sanitize(body.experience || "");
    const jd = sanitize(body.jd || "");
    const alignmentResult = body.alignmentResult || {};
    const currentHeadline = sanitize(body.currentHeadline || "");
    const currentAbout = sanitize(body.currentAbout || "");
    const inferredRole = sanitize(body.inferredRole || "");

    let result: unknown;

    switch (type) {
      case "gap_actions": {
        const gaps = alignmentResult.missing_keywords || [];
        const topGap = alignmentResult.top_missing_signal || "";
        const scoreRationale = alignmentResult.score_rationale || [];
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

You are a hiring signal analyst. Given these signal gaps from a resume-to-JD alignment analysis, produce actionable fix cards.

Resume experience: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}
Top missing signal: ${topGap}
Missing keywords: ${gaps.join(", ")}
Score rationale: ${scoreRationale.join("; ")}

ZERO METRIC FABRICATION RULE:
- NEVER invent, suggest, or illustrate any percentages, counts, timeframes, dollar amounts, user counts, relationship counts, scope figures, or quantitative claims that do not appear verbatim in the resume text above.
- Do NOT provide example bullets containing fabricated numbers (e.g. "managed 12 vendor relationships" or "reduced costs by 30%") unless those exact figures exist in the resume.
- If a metric does not exist in the resume, do not create one, suggest one, or use one as an illustration.
- Action text must describe WHAT to reposition or reframe, not provide a finished bullet with invented data.

For the top 3 signal gaps, produce a JSON array of exactly 3 objects with:
- "gap_name": short name of the gap
- "why_it_hurts": one sentence explaining why this gap reduces match score
- "action": one specific resume action — a keyword to add, a bullet to reframe, or a section to restructure — written as a direct instruction the user can execute immediately. Start with a verb. Do NOT include example metrics, percentages, or figures that are not in the resume.
- "impact": "High", "Medium", or "Low" based on how much closing this gap would affect hiring stage outcomes

Order by highest impact first. Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "calibrated_summary": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively. Never use the candidate's name or third-person pronouns.

Generate professional summary variants for this candidate targeting this specific role. Use only experience that exists in the resume — zero fabrication, zero inflation.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

Each variant must reposition the same experience through a different strategic lens:

Variant A — Ownership Emphasis: Open with scope of responsibility and end-to-end ownership language. Lead with what the candidate ran, not what they did.

Variant B — Client Impact Emphasis: Open with client-facing outcomes and relationship language. Lead with who the candidate served and what changed for them.

Variant C — Cross-Functional Emphasis: Open with coordination scope and stakeholder complexity. Lead with the breadth of teams and parties the candidate operated across.

Each variant: 3 sentences maximum. No variant should sound like the others. Every sentence must be traceable to actual resume content. Third person, institutional voice.

Return a JSON object with:
- "variants": [{"name": "Ownership Emphasis", "text": "...", "why_this_works": "one-liner explaining which signal dimension it strengthens"}, ...]

Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 2000);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "interview_intelligence": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

You are a hiring manager for this specific role. Based on the signal gaps and risks identified in this alignment analysis, generate exactly 5 interview questions you would ask this candidate.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}
Match score: ${alignmentResult.match_score || "N/A"}
Top missing signal: ${alignmentResult.top_missing_signal || "N/A"}
Score rationale: ${(alignmentResult.score_rationale || []).join("; ")}
Missing keywords: ${(alignmentResult.missing_keywords || []).join(", ")}

Each question must: (1) directly probe a specific gap or risk from the analysis — not a generic interview question, (2) be written exactly as a hiring manager would ask it in a real interview, first person, direct, (3) include a "why_asking" note in one sentence tied to the specific gap it probes, (4) include a "signal_angle" coaching note in one sentence telling the user what their answer must demonstrate to pass this question, (5) include an "answer_framework" object with three short fields: "situation" (1 line: what context to set), "action" (1 line: what you did), "result" (1 line: what changed). Each framework line must be specific to this candidate's resume and gap — not generic SAR advice. Zero generic questions.

ZERO METRIC FABRICATION in signal_angle or answer_framework:
- NEVER instruct the user to provide "actual numbers", "specific metrics", "exact percentages", or quantified results they may not have.
- For impact or outcome questions, coach the user to describe qualitative outcomes: process improvements, stakeholder responses, operational changes, risk reductions, team capability shifts, or observable business value.
- Example good signal_angle: "Describe the operational improvement you drove and how stakeholders responded — focus on what changed, not on inventing a number."
- Example bad signal_angle: "Give actual numbers showing revenue impact." (NEVER do this)

ZERO BRACKETED PLACEHOLDERS:
- NEVER use bracket notation like [specific CRM platform], [your project], [Insert X], [specific tool], or any [text] pattern in any output field.
- If a specific tool, platform, project, or detail cannot be identified from the resume, use safe generic phrasing instead.
- Example: Instead of "[specific CRM platform]", write "the CRM systems you've used". Instead of "[your project]", write "a relevant project or initiative". Instead of "[specific metric]", write "a concrete outcome you observed".
- This applies to ALL fields: question, why_asking, signal_angle, situation, action, and result.

Return a JSON array of 5 objects with: "question", "why_asking", "signal_angle", "answer_framework" (object with "situation", "action", "result" strings)
Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 2000);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        // Post-generation: strip any bracketed placeholders that slipped through
        const stripBrackets = (s: string) => s.replace(/\[([^\]]{1,60})\]/g, (_m, inner) => {
          const lower = inner.toLowerCase();
          if (lower.includes('crm') || lower.includes('platform') || lower.includes('tool') || lower.includes('system') || lower.includes('software')) return 'the tools you\'ve used';
          if (lower.includes('project') || lower.includes('initiative')) return 'a relevant project or initiative';
          if (lower.includes('metric') || lower.includes('number') || lower.includes('percentage')) return 'a concrete outcome you observed';
          if (lower.includes('company') || lower.includes('organization')) return 'your organization';
          if (lower.includes('team') || lower.includes('department')) return 'your team';
          return inner; // fallback: use the inner text without brackets
        });
        if (Array.isArray(result)) {
          result = result.map((q: Record<string, unknown>) => {
            const cleaned: Record<string, unknown> = { ...q };
            for (const key of ['question', 'why_asking', 'signal_angle']) {
              if (typeof cleaned[key] === 'string') cleaned[key] = stripBrackets(cleaned[key] as string);
            }
            if (cleaned.answer_framework && typeof cleaned.answer_framework === 'object') {
              const af = { ...(cleaned.answer_framework as Record<string, string>) };
              for (const key of ['situation', 'action', 'result']) {
                if (typeof af[key] === 'string') af[key] = stripBrackets(af[key]);
              }
              cleaned.answer_framework = af;
            }
            return cleaned;
          });
        }
        break;
      }

      case "ats_panel": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

Identify keywords and phrases from this job description that are absent or under-represented in the resume, and keywords that match well.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

Return a JSON object with:
- "missing_keywords": array of up to 10 specific, meaningful keywords/phrases from the JD absent from the resume. Not generic words like "experience" or "strong." Each as a string.
- "matched_keywords": array of up to 10 keywords/phrases present in both JD and resume. Each as a string.
- "ats_risk": "High" (6+ missing), "Moderate" (3-5 missing), or "Low" (0-2 missing)
- "ats_risk_explanation": one sentence explaining the risk score

Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "linkedin_headline": {
        const signalModel = alignmentResult.signal_model || {};
        const primaryStrength = signalModel.executive_insight_summary?.primary_strength || alignmentResult.top_matched_signal || "";
        const missingKws = (alignmentResult.missing_keywords || []).slice(0, 8).join(", ");
        const gaps = Array.isArray(signalModel.gaps) ? signalModel.gaps.slice(0, 5).map((g: unknown) => typeof g === "string" ? g : (g as any)?.name || g).join(", ") : "";

        const prompt = `You are a LinkedIn positioning specialist. Generate ONE repositioned LinkedIn headline for a candidate targeting ${inferredRole}.

Resume: ${experience.slice(0, 3000)}
Current headline: ${currentHeadline || "(none)"}
Primary strength from alignment: ${primaryStrength}
Signal gaps: ${gaps}
Missing keywords: ${missingKws}

RULES:
- Under 220 characters
- Lead with the candidate's strongest signal for this specific role
- Use language a recruiter scanning for ${inferredRole} would pattern-match on
- Active framing only — no passive constructions
- No buzzwords or AI tells: "passionate," "results-driven," "dynamic," "innovative," "seasoned," "dedicated," "demonstrates," "utilized," "leveraged," "proven track record"
- Sound like a high-performing professional wrote it, not like AI. Avoid the generic "Title | Keyword • Keyword • Keyword" filler pattern unless it genuinely reads naturally.
- ZERO FABRICATION: every word must be traceable to the resume. Do NOT invent tools, industries, scope, metrics, employer names, certifications, or domain claims not present in the resume.
- Do NOT add metrics, percentages, team sizes, or quantified claims not verbatim in the resume.

Return a JSON object with: "headline" (the repositioned headline text), "signal_basis" (one sentence explaining which resume evidence this headline is based on)
Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "linkedin_about_guidance": {
        const signalModel = alignmentResult.signal_model || {};
        const primaryStrength = signalModel.executive_insight_summary?.primary_strength || "";
        const gaps = Array.isArray(signalModel.gaps) ? signalModel.gaps.slice(0, 5).map((g: unknown) => typeof g === "string" ? g : (g as any)?.name || g).join(", ") : "";
        const missingKws = (alignmentResult.missing_keywords || []).slice(0, 8).join(", ");
        const strengths = Array.isArray(signalModel.strengths) ? signalModel.strengths.slice(0, 5).join(", ") : "";

        const prompt = `You are a LinkedIn positioning specialist. Generate exactly 3 specific, actionable suggestions for repositioning this candidate's LinkedIn About section to align with ${inferredRole}.

Resume: ${experience.slice(0, 3000)}
Current About section: ${currentAbout || "(none)"}
Primary strength: ${primaryStrength}
Detected strengths: ${strengths}
Signal gaps from alignment: ${gaps}
Missing keywords: ${missingKws}

Each suggestion must:
1. Address a specific signal gap identified in the alignment analysis
2. Reference real experience from the resume that can be repositioned
3. Explain exactly what to change and why it matters for recruiter perception
4. Be actionable — tell the user what to write, not vague advice

RULES:
- No generic LinkedIn advice ("tell your story," "add a hook," "show personality")
- ZERO FABRICATION: every suggestion must reference only experience, tools, outcomes, or language that exists in the resume. Never instruct the user to add, estimate, or invent metrics, percentages, scope figures, tools, industries, certifications, or domain claims not in their resume.
- Do NOT use outcome-implying verbs ("improved," "increased," "reduced," "enhanced," "boosted," "optimized") unless that exact verb+outcome pair appears verbatim in the resume.
- Each suggestion should strengthen a different signal dimension

Return a JSON array of exactly 3 objects with:
- "gap_addressed": the signal gap this suggestion fixes (from alignment)
- "suggestion": the specific actionable instruction (2-3 sentences)
- "resume_evidence": the specific resume content this suggestion is based on (quote or paraphrase)
Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "linkedin_experience_notes": {
        const signalModel = alignmentResult.signal_model || {};
        const gaps = Array.isArray(signalModel.gaps) ? signalModel.gaps.slice(0, 5).map((g: unknown) => typeof g === "string" ? g : (g as any)?.name || g).join(", ") : "";
        const missingKws = (alignmentResult.missing_keywords || []).slice(0, 8).join(", ");

        const prompt = `You are a LinkedIn positioning specialist. For each role listed in this resume, generate ONE specific note explaining how the LinkedIn experience entry should differ from the resume version.

Resume: ${experience.slice(0, 4000)}
Target role: ${inferredRole}
Signal gaps from alignment: ${gaps}
Missing keywords: ${missingKws}

Each note must:
1. Identify the specific role/company from the resume
2. Explain what to change on LinkedIn vs. the resume version
3. Optimize for recruiter search patterns and LinkedIn discoverability for ${inferredRole}
4. Preserve zero-fabrication — only reframe language already present

RULES:
- ZERO FABRICATION: Never instruct the user to add, estimate, or invent metrics, percentages, scope figures, tools, industries, certifications, or domain claims not in the resume.
- Do NOT recharacterize employer context or industry — use only what the resume states.
- Do NOT use outcome-implying verbs ("improved," "increased," "reduced," "enhanced") unless that exact verb+outcome pair appears verbatim in the resume.
- LinkedIn entries should emphasize searchable keywords, ownership language, and role-native terminology.
- Each note should be 2-3 sentences of specific repositioning guidance.

Return a JSON array of objects with:
- "role_title": the role title as it appears in the resume
- "company": the company name as it appears in the resume
- "note": the specific repositioning guidance for this LinkedIn entry
Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 2000);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "linkedin_summary": {
        // Legacy — kept for backward compatibility but no longer primary path
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

Rewrite this LinkedIn About section for a candidate targeting ${inferredRole}. Use only experience from the resume — zero fabrication.

Resume: ${experience.slice(0, 3000)}
Current About: ${currentAbout || "(none — build from scratch)"}

The summary must: open with a hook that names their specific professional identity in one sentence, spend the middle section connecting their cross-environment experience to the target role's core requirements, and close with a forward-looking statement about what kind of role and organization they're seeking. 3 paragraphs maximum.

TONE — sound like an actual high-performing professional, not AI or copied resume bullets:
- First person, confident, conversational but sharp. Write the way a strong professional actually talks about their work.
- Do NOT paste resume bullets. Connect experience into a narrative with a point of view.
- BANNED AI TELLS: "passionate about," "results-driven," "dynamic," "proven track record," "demonstrates," "utilized," "leveraged," "in order to," "wide range of," "seasoned," "dedicated professional," "synergy," "spearheaded."
- No formulaic AI transitions ("Furthermore," "Moreover," "In today's fast-paced world"). Vary sentence length.
- ZERO FABRICATION: every claim must trace to the resume.

Return a JSON object with: "summary" (the full About section text)
Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "cover_letter": {
        const companyName = sanitize(body.companyName || "the company");
        const roleTitle = inferredRole || "this role";
        const tone = sanitize(body.tone || "confident");

        const signalModel = alignmentResult.signal_model || {};
        const execSummary = signalModel.executive_insight_summary || alignmentResult.executive_insight_summary || {};
        const gaps = signalModel.gaps || alignmentResult.gaps || [];

        const gap = gaps[0] || alignmentResult.top_missing_signal || "N/A";
        const strength = execSummary.primary_strength || "N/A";

        const toneTemp = tone === "strategic" ? 0.4 : tone === "direct" ? 0.2 : 0.55;

        const toneDirective = tone === "strategic"
          ? `TONE: Strategic. Write like a senior operator briefing someone who makes hiring decisions. Commercially precise. Frame every paragraph around business impact, organizational outcomes, or market context. Never open a sentence with "I" unless unavoidable. Sentences average 18-22 words. Use subordinate clauses. No contractions. No exclamation marks. The letter should read like a business case written by someone who understands the company's problems. No paragraph exceeds 3 lines. The close is one sentence — a decisive statement, not a meeting request. Total length: 260-280 words.`
          : tone === "direct"
          ? `TONE: Direct. Short declarative sentences. No adjectives unless they carry data. Subject-verb-object. Every word must prove something or it gets cut. Sentences average 8-14 words. No compound sentences joined by "and" — split them. No semicolons. Periods only. No paragraph exceeds 3 lines. The close is one forward statement of intent. The letter should feel like it was written by someone who values the reader's time. Total length: 200-220 words.`
          : `TONE: Confident. Write like a sharp professional who genuinely wants this specific job. Warm but not casual. Direct but not stiff. Mix sentence lengths — one short punch after a longer thought. Show momentum. Contractions are fine. At least one paragraph should contain a sentence under 6 words. The letter should feel like a real person wrote it because they wanted the job. Total length: 240-260 words.`;

        const companyRef = companyName !== "the company" ? companyName : "";
        const prompt = `You are writing a cover letter as the candidate. First person. Applying for ${roleTitle}${companyRef ? ` at ${companyRef}` : ""}.

CONTEXT:
- Your biggest strength for this role: ${strength}
- Your biggest gap for this role: ${gap}
- Resume (your ONLY source of facts — invent NOTHING): ${experience.slice(0, 2500)}
- Job description: ${jd.slice(0, 1500)}

${toneDirective}

STRUCTURE — exactly 5 paragraphs:

P1 — OPENING HOOK: Start with your single strongest credential for this specific role — a number, a system, a scope of work. Then one sentence connecting it to why ${companyRef || "this company"} or this role. No "I am writing to apply." No philosophy. Start mid-action.

P2 — OPERATIONAL PROOF: Your hardest relevant work. Volumes, outcomes, problems you solved. At least one sentence should lead with the result, not "I." Show you do the hard work this role requires.

P3 — TRANSFERABLE FIT: Connect a different dimension of your experience — analytical capability, technical skill, cross-functional coordination — to what this role needs. Use specifics from the resume. Do not explain that experience "translates" — just demonstrate it through what you did.

P4 — WHY HERE: Show you understand what ${companyRef || "this company"} does and why you want to be part of it specifically. Reference something concrete about the company or role. Then acknowledge what you haven't done yet in one short clause, immediately followed by what makes you ready to figure it out. No apology.

P5 — CLOSE: One to two sentences. Make the reader want to have the conversation. No onboarding plans. No "I look forward to discussing." End with forward motion.

WRITING RULES:
- Max 1 sentence per paragraph may start with "I"
- Never explain WHY experience applies — use it as direct proof
- Never describe what the role requires — the hiring manager knows
- ZERO fabrication — every claim must trace to the resume
- No bridging language: avoid "this experience," "these skills," "that background"
- BANNED PHRASES: "track record," "positioned to," "passionate about," "eager to," "proven ability," "results-driven," "strong foundation," "translates to," "directly translates," "mirrors," "taught me," "aligns with," "prepared me," "transferable," "equipped me," "natural next step," "I learned that," "comprehensive," "I am excited to," "I am thrilled," "I would love to," "I look forward to discussing," "my first priority," "I plan to," "I intend to," "utilized," "leveraged," "in order to," "demonstrates," "dynamic," "a wide range of," "synergy," "spearheaded," "dedicated," "seasoned"
- No empty enthusiasm. Every sentence must either prove capability or create pull toward a meeting.
- Sound like a real person who happens to write well — not like an AI cover-letter template. No formulaic transitions ("Furthermore," "Moreover," "In conclusion"). Vary sentence length. Plain words over impressive ones.

OUTPUT: Return ONLY valid JSON: {"letter": "the full letter body — paragraphs separated by double newlines, no salutation or closing"}`;

        const raw = await callAI(prompt, 2000, toneTemp, 1);
        let cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        // Resilient JSON extraction
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
        }
        result = JSON.parse(cleaned);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown content type" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-pro-content] Unhandled error:", err);
    return new Response(JSON.stringify({
      status: "error",
      error_code: "INTERNAL_ERROR",
      message: "An internal error occurred. Please try again.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
