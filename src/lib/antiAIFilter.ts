/**
 * Anti-AI Signal Filter
 * 
 * Post-processes generated text to remove overused AI patterns,
 * ensuring output reads as confident, specific human writing.
 * 
 * Applied ONLY to: calibrated bullets, calibrated summary, cover letter body.
 * NOT applied to: diagnostic sections, scoring, analysis output.
 */

// ─── Overused AI phrases → cleaner replacements ─────────────────────────────

const FORMULAIC_TAIL_RX = /,?\s*(?:improving service outcomes|reducing operational risk|aligned to (?:cross[- ]?functional|[\w\s]+) priorities|throughout the customer lifecycle|driving stronger operational outcomes|improving operational outcomes|improving operational efficiency|improving operational efficiency and team execution|reducing operational risk and strengthening compliance outcomes|improving service outcomes and stakeholder trust)\s*\.?\s*$/gi;

const PHRASE_REPLACEMENTS: [RegExp, string][] = [
  // Inflated verbs
  [/\bLeveraged\b/g, "Used"],
  [/\bleveraged\b/g, "used"],
  [/\bSpearheaded\b/g, "Led"],
  [/\\bspearheaded\\b/g, "led"],
  [/\\bPioneered\\b/g, "Built"],
  [/\\bpioneered\\b/g, "built"],
  [/\\bOrchestrated\\b/g, "Coordinated"],
  [/\\borchestrated\\b/g, "coordinated"],
  [/\\bChampioned\\b/g, "Drove"],
  [/\\bchampioned\\b/g, "drove"],
  [/\\bCatalyzed\\b/g, "Started"],
  [/\\bcatalyzed\\b/g, "started"],
  [/\\bFacilitated\\b/g, "Ran"],
  [/\\bfacilitated\\b/g, "ran"],
  [/\\bSynergized\\b/g, "Combined"],
  [/\\bsynergized\\b/g, "combined"],
  [/\\bUtilized\\b/g, "Used"],
  [/\\butilized\\b/g, "used"],
  [/\\bsynergy\\b/gi, "coordination"],
  [/\\bsynergies\\b/gi, "efficiencies"],

  // Passive/weak ownership
  [/\\bWas responsible for\\b/gi, "Owned"],
  [/\\bwas responsible for\\b/gi, "owned"],
  [/\\bResponsible for\\b/g, "Owned"],
  [/\\bresponsible for\\b/g, "owned"],
  [/\\bAssisted with\\b/g, "Supported"],
  [/\\bassisted with\\b/g, "supported"],
  [/\\bHelped to\\b/g, ""],
  [/\\bhelped to\\b/g, ""],
  [/\\bHelped\s+(?=[a-z])/g, ""],
  [/\\bhelped\s+(?=[a-z])/g, ""],
  [/\\bPlayed a key role in\\b/gi, ""],
  [/\\bplayed a key role in\\b/gi, ""],
  [/\\bPlayed an instrumental role in\\b/gi, ""],
  [/\\bServed as\\b/g, "Worked as"],
  [/\\bserved as\\b/g, "worked as"],
  [/\\bTasked with\\b/g, ""],
  [/\\btasked with\\b/g, ""],

  // Generic AI filler phrases
  [/\\bdemonstrated ability to\\b/gi, ""],
  [/\\bDemonstrated a proven ability to\\b/gi, ""],
  [/\\bproven ability to\\b/gi, ""],
  [/\\bProven track record of\\b/gi, ""],
  [/\\bproven track record of\\b/gi, ""],
  [/\\bresults-driven\\b/gi, ""],
  [/\\bResults-oriented\\b/gi, ""],
  [/\\bresults-oriented\\b/gi, ""],
  [/\\bself-starter\\b/gi, ""],
  [/\\bSelf-motivated\\b/gi, ""],
  [/\\bself-motivated\\b/gi, ""],
  [/\\bhighly motivated\\b/gi, ""],
  [/\\bdetail-oriented\\b/gi, ""],
  [/\\bteam player\\b/gi, ""],
  [/\\bgo-getter\\b/gi, ""],
  [/\\bthought leader\\b/gi, ""],
  [/\\bin a dynamic environment\\b/gi, ""],
  [/\\bin a fast-paced environment\\b/gi, ""],
  [/\\bfast-paced team\\b/gi, "team"],
  [/\\bdynamic team\\b/gi, "team"],
  [/\\bleveraging synergies\\b/gi, ""],
  [/\\bcross-functional alignment\\b/gi, "cross-team coordination"],
  [/\\bpassionate about\\b/gi, "focused on"],
  [/\\bthrilled to\\b/gi, "ready to"],
  [/\\bexcited to\\b/gi, "ready to"],
  [/\\benthusiastic about\\b/gi, "focused on"],
  [/\\bdedicated to\\b/gi, "focused on"],
  [/\\bcommitted to\\b/gi, "focused on"],
  [/\\bI am writing to express my interest\\b/gi, ""],
  [/\\bI am eager to\\b/gi, "I am ready to"],
  [/\\bI am excited to\\b/gi, "I am ready to"],

  // Engine-language / transfer-chain patterns
  [/\\bThis translates to\\b/gi, ""],
  [/\\bwhich translates to\\b/gi, "—"],
  [/\\bThis mirrors\\b/gi, ""],
  [/\\bwhich mirrors\\b/gi, "—"],
  [/\\bThis taught me\\b/gi, "I learned"],
  [/\\bwhich taught me\\b/gi, "— I learned"],
  [/\\bThis required me to\\b/gi, "I"],
  [/\\bwhich required me to\\b/gi, "— I"],
  [/\\bThis demonstrates\\b/gi, ""],
  [/\\bwhich demonstrates\\b/gi, "—"],
  [/\\bThis supports\\b/gi, ""],
  [/\\bwhich supports\\b/gi, "—"],
  [/\\bThis directly applies\\b/gi, ""],
  [/\\bwhich directly applies\\b/gi, "—"],
  [/\\bThis aligns with\\b/gi, ""],
  [/\\bwhich aligns with\\b/gi, "—"],
  [/\\bThis prepared me\\b/gi, "I"],
  [/\\bwhich prepared me\\b/gi, "— I"],
  [/\\bThis experience\\b/g, "That work"],
  [/\\bthis experience\\b/g, "that work"],
  [/\\bdirectly relevant\\b/gi, "relevant"],
  [/\\bdirectly applicable\\b/gi, "applicable"],
  [/\\btransferable skills?\\b/gi, "experience"],
  [/\\btransferable\\b/gi, "relevant"],
  [/\\bstrong foundation\\b/gi, "background"],
  [/\\bI look forward to discussing\\b/gi, ""],
  [/\\bThank you for your consideration\\b/gi, ""],
  [/\\bthank you for your consideration\\b/gi, ""],
  [/\\bI look forward to\\b/gi, ""],

  // Philosophy / essay openers
  [/\\bCustomer experience lives\\b/gi, ""],
  [/\\bThe fundamentals are\\b/gi, ""],
  [/\\bThis represents the next step\\b/gi, ""],
  [/\\bThis represents the natural evolution\\b/gi, ""],
  [/\\bWhat matters is\\b/gi, ""],
  [/\\bI learned that\\b/gi, ""],
  [/\\bThis environment developed\\b/gi, ""],
  [/\\bIt's not about\\b/gi, ""],
  [/\\bthe natural evolution\\b/gi, "a step"],
  [/\\bthe next step\\b/gi, "a step"],
  [/\\bFurthermore,?\\b/gi, ""],
  [/\\bAdditionally,?\\b/gi, ""],
  [/\\bMoreover,?\\b/gi, ""],

  // Transfer/equivalency framing — the core problem
  [/\\bThis role requires\\b/gi, ""],
  [/\\bthis role requires\\b/gi, ""],
  [/\\bThis position represents\\b/gi, ""],
  [/\\bthis position represents\\b/gi, ""],
  [/\\bthe same skills\\b/gi, "similar work"],
  [/\\boperate consistently across\\b/gi, "work across"],
  [/\\bdirectly supports\\b/gi, "supports"],
  [/\\bThis directly supports\\b/gi, ""],
  [/\\bnatural next step\\b/gi, "next move"],
  [/\\bwhat this role needs\\b/gi, ""],
  [/\\bthis prepared me for\\b/gi, ""],
  [/\\bThis prepared me for\\b/gi, ""],
  [/\\bbecame critical operational challenges I solved\\b/gi, ""],
  [/\\bthe same principles apply\\b/gi, ""],
  [/\\bhowever,? the same\\b/gi, ""],
  [/\\bthis directly applies\\b/gi, ""],
  [/\\bcomprehensive\\b/gi, "full"],

  // Over-polished candidacy narration patterns
  [/\\bhas equipped me\\b/gi, "meant I"],
  [/\\bequipped me with\\b/gi, "gave me"],
  [/\\bwell-positioned\\b/gi, "ready"],
  [/\\bpositions me to\\b/gi, "means I can"],
  [/\\bI am positioned\\b/gi, "I'm ready"],
  [/\\bpositioned to\\b/gi, "ready to"],
  [/\\bI am confident that\\b/gi, ""],
  [/\\bI'm confident that\\b/gi, ""],
  [/\\btrack record of\\b/gi, "history of"],
  [/\\bskill set\\b/gi, "skills"],
  [/\\bskillset\\b/gi, "skills"],
  [/\\bmake an immediate impact\\b/gi, "contribute quickly"],
  [/\\bhit the ground running\\b/gi, "start quickly"],
  [/\\buniquely qualified\\b/gi, "qualified"],
  [/\\buniquely positioned\\b/gi, "ready"],
  [/\\bmy background in\\b/gi, "my work in"],
  [/\\bextensive experience\\b/gi, "experience"],
  [/\\bdemonstrated expertise\\b/gi, "experience"],
  [/\\bcomprehensive understanding\\b/gi, "understanding"],
  [/\\bdeep understanding\\b/gi, "understanding"],
  [/\\brobust understanding\\b/gi, "understanding"],
  [/\\bseamlessly\\b/gi, "smoothly"],
  [/\\bholistic approach\\b/gi, "approach"],
  [/\\bholistic\\b/gi, "full"],
];

// ─── Em dash cleanup ────────────────────────────────────────────────────────

function reduceEmDashes(text: string): string {
  // Replace patterns like "word — word" used as sentence connectors
  // Keep the first occurrence per paragraph, replace subsequent ones
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map(para => {
    let dashCount = 0;
    return para.replace(/\s*—\s*/g, (match) => {
      dashCount++;
      if (dashCount <= 1) return match; // keep first em dash
      return ". "; // replace subsequent em dashes with period
    });
  }).join("\n\n");
}

// ─── Post-cleanup: fix double spaces, capitalization after removals ──────────

function cleanupWhitespace(text: string): string {
  return text
    // Fix double/triple spaces from removed phrases
    .replace(/  +/g, " ")
    // Fix leading space after period
    .replace(/\.\s{2,}/g, ". ")
    // Fix comma followed by removed phrase leaving orphan comma
    .replace(/,\s*,/g, ",")
    // Fix sentence starting with lowercase after removal
    .replace(/(?:^|\.\s+)([a-z])/gm, (match, letter) => {
      return match.slice(0, -1) + letter.toUpperCase();
    })
    // Fix bullet starting with lowercase
    .replace(/^([a-z])/gm, (match) => match.toUpperCase())
    // Remove orphan leading commas
    .replace(/^\s*,\s*/gm, "")
    .trim();
}

// ─── Reduce repeated sentence-starting "I" ─────────────────────────────────

function reduceRepeatedI(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map(para => {
    // Split into sentences (simple split on ". " or start of line)
    const sentences = para.split(/(?<=\.)\s+/);
    if (sentences.length < 3) return para;

    let consecutive = 0;
    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const startsWithI = /^I\s/.test(sentences[i].trim());
      if (startsWithI) {
        consecutive++;
      } else {
        consecutive = 0;
      }

      // On the 3rd+ consecutive "I" sentence, reframe by removing leading "I"
      if (consecutive >= 3 && startsWithI) {
        const s = sentences[i].trim();
        // Try to restructure: "I led the team..." → "Led the team..."
        // or "I managed..." → "Managed..."
        const reframed = s.replace(/^I\s+/, "");
        result.push(reframed.charAt(0).toUpperCase() + reframed.slice(1));
        consecutive = 0; // reset after reframe
      } else {
        result.push(sentences[i]);
      }
    }

    return result.join(" ");
  }).join("\n\n");
}

// ─── Break uniform parallel bullet structure ────────────────────────────────

/**
 * Detects when consecutive bullets all start with the same verb pattern
 * and varies the structure of middle bullets to break robotic rhythm.
 */
export function breakParallelBullets(bullets: string[]): string[] {
  if (bullets.length < 3) return bullets;

  // Extract leading verbs
  const getLeadVerb = (b: string) => {
    const match = b.trim().match(/^([A-Z][a-z]+)\b/);
    return match ? match[1] : null;
  };

  const result = [...bullets];
  let streak = 1;

  for (let i = 1; i < result.length; i++) {
    const prev = getLeadVerb(result[i - 1]);
    const curr = getLeadVerb(result[i]);

    if (prev && curr && prev === curr) {
      streak++;
    } else {
      streak = 1;
    }

    // On 3rd+ identical verb start, prepend context to break pattern
    if (streak >= 3) {
      const bullet = result[i].trim();
      // Remove the repeated verb and restructure
      const withoutVerb = bullet.replace(/^[A-Z][a-z]+\s+/, "");
      result[i] = "Also " + withoutVerb.charAt(0).toLowerCase() + withoutVerb.slice(1);
      streak = 0;
    }
  }

  return result;
}

// ─── Main filter ────────────────────────────────────────────────────────────

export function antiAIFilter(text: string): string {
  if (!text || typeof text !== "string") return text;

  let result = text;

  // Step 1: Replace overused AI phrases
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // Step 1b: Strip formulaic tail phrases
  result = result.replace(FORMULAIC_TAIL_RX, ".");

  // Step 2: Reduce excessive em dashes
  result = reduceEmDashes(result);

  // Step 3: Reduce repeated "I" sentence starts
  result = reduceRepeatedI(result);

  // Step 4: Clean up whitespace and capitalization
  result = cleanupWhitespace(result);

  return result;
}

/**
 * Filter an array of bullet strings — includes parallel structure breaking
 */
export function filterBullets(bullets: string[]): string[] {
  const filtered = bullets.map(b => antiAIFilter(b));
  return breakParallelBullets(filtered);
}
