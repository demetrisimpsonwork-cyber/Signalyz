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

const PHRASE_REPLACEMENTS: [RegExp, string][] = [
  // Inflated verbs
  [/\\bLeveraged\\b/g, "Used"],
  [/\\bleveraged\\b/g, "used"],
  [/\\bSpearheaded\\b/g, "Led"],
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
  [/\\bMobilized\\b/g, "Coordinated"],
  [/\\bmobilized\\b/g, "coordinated"],
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

  // Generic outcome filler — remove trailing filler phrases that add no specificity
  [/,?\s*(?:improving|enhancing|ensuring|driving|boosting|achieving|delivering)\s+(?:overall\s+)?(?:efficiency|productivity|performance|success|excellence|value|outcomes|results|operations)\s*\.?$/gi, "."],
  [/,?\s*optimizing\s+(?:overall\s+)?(?:workflows?|operations|processes)\s*\.?$/gi, "."],

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
  // Keep the first occurrence per paragraph, replace subsequent ones.
  // IMPORTANT: reduce to a comma, never a period — a period here splits a clause
  // from its subject and produces fragments like "... forward. Was a consistent
  // part of both positions."
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map(para => {
    let dashCount = 0;
    return para.replace(/\s*—\s*/g, (match) => {
      dashCount++;
      if (dashCount <= 1) return match; // keep first em dash
      return ", "; // replace subsequent em dashes with a comma (no fragments)
    });
  }).join("\n\n");
}

// ─── Sentence-fragment repair ───────────────────────────────────────────────

/**
 * Repair clauses that were split from their subject and now begin with a bare
 * linking verb (e.g. "... move forward. Was a consistent part."). A cover-letter
 * sentence never legitimately starts with Was/Is/Were/Are, so rejoin it to the
 * previous sentence with a comma. Guards against fragments from any source
 * (em-dash reduction, edge humanizeProse, or the model itself).
 */
export function repairSentenceFragments(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(
    /([A-Za-z0-9,;)])\.\s+(Was|Is|Were|Are)\b/g,
    (_m, prev: string, verb: string) => `${prev}, ${verb.toLowerCase()}`,
  );
}

// ─── Dangling aside before main verb ────────────────────────────────────────

/**
 * Repair a subject that is separated from its main verb by an em-dash aside
 * whose closing delimiter became a comma (e.g. after em-dash reduction):
 *   "Managing 40–70 cases daily at NJDOL — while resolving 8–15 per day under
 *    strict SLA requirements, reflects the kind of discipline..."
 * becomes:
 *   "Managing 40–70 cases daily at NJDOL reflects the kind of discipline..."
 *
 * The signature is a lone em-dash opening an aside that is closed with a comma
 * immediately before the sentence's main present-tense verb — a comma splice
 * that reads as broken subject/verb structure. The aside is dropped so the
 * subject reconnects cleanly to the verb. Bounded length + no crossing periods
 * or additional em-dashes keeps it from over-matching normal prose.
 */
const MAIN_CLAUSE_VERBS =
  "reflects|reflect|demonstrates|demonstrate|shows|show|means|requires|require|represents|represent|applies|apply|proves|prove|signals|signal|mirrors|mirror|matches|match";

export function repairAsideBeforeMainVerb(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(
    new RegExp(`\\s*—\\s*[^—.]{2,90}?,\\s*(${MAIN_CLAUSE_VERBS})\\b`, "g"),
    (_m, verb: string) => ` ${verb}`,
  );
}

// ─── Em-dash appositive list repair ─────────────────────────────────────────

/**
 * Repair an em-dash appositive list whose closing delimiter became a comma
 * (typically after em-dash reduction), leaving a comma right before a linking
 * verb:
 *   "CarMax's model — transparent pricing, a structured process, no-pressure
 *    guidance, is the kind of environment..."
 * becomes:
 *   "CarMax's model — transparent pricing, a structured process, and
 *    no-pressure guidance — is the kind of environment..."
 *
 * Only fires when the aside is a comma list (≥2 items). It re-closes the aside
 * with an em-dash and inserts the missing "and" before the final item. Bounded
 * length + no crossing periods/em-dashes keeps it conservative.
 */
export function repairEmDashAppositiveList(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(
    /—\s*([^—.]{2,120}?),\s*(is|are|was|were)\b/g,
    (whole, aside: string, verb: string) => {
      if (!aside.includes(",")) return whole; // only list appositives
      const items = aside.split(/,\s*/).filter(Boolean);
      if (items.length >= 2 && !/^and\s/i.test(items[items.length - 1])) {
        items[items.length - 1] = `and ${items[items.length - 1]}`;
      }
      return `— ${items.join(", ")} — ${verb}`;
    },
  );
}

// ─── List-to-verb repair ────────────────────────────────────────────────────

/**
 * Repair a comma list whose items are the subject of a following plural verb but
 * were written with a broken comma splice, e.g.:
 *   "documentation accuracy, process integrity, real-time judgment under
 *    pressure, apply directly..."
 * becomes:
 *   "documentation accuracy, process integrity, and real-time judgment under
 *    pressure all apply directly..."
 *
 * Requires at least three list items (two "item, " leads + a final item) so it
 * never touches a well-formed two-item clause. If the last item already begins
 * with "and", the duplicate conjunction is dropped.
 */
const LIST_SUBJECT_VERBS = "apply|translate|transfer|carry|hold|matter";

export function repairCapabilityListVerb(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(
    new RegExp(
      `((?:[A-Za-z][^,.;:]*?, ){2,})([A-Za-z][^,.;:]*?), (${LIST_SUBJECT_VERBS})\\b`,
      "g",
    ),
    (_m, head: string, last: string, verb: string) =>
      `${head}and ${last.replace(/^and\s+/i, "")} all ${verb}`,
  );
}

/**
 * Repair a 3+ item comma list that is missing "and" before its final item and
 * has a stray comma before the connecting preposition that follows it:
 *   "guiding individuals, employers, healthcare providers, through complex
 *    processes"
 * becomes:
 *   "guiding individuals, employers, and healthcare providers through complex
 *    processes"
 *
 * The connector set is limited to prepositions that read as the list's object
 * marker (through/across/into/within/throughout/toward/towards) to avoid
 * touching legitimate comma pauses before common words like "for" or "to".
 */
const LIST_OBJECT_CONNECTORS = "through|across|into|within|throughout|toward|towards";

export function repairListMissingAnd(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(
    new RegExp(
      `((?:[A-Za-z][^,.;:]*?, ){2,})([A-Za-z][^,.;:]*?), (${LIST_OBJECT_CONNECTORS})\\b`,
      "g",
    ),
    (_m, head: string, last: string, conn: string) =>
      `${head}and ${last.replace(/^and\s+/i, "")} ${conn}`,
  );
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

  // Step 2: Reduce excessive em dashes
  result = reduceEmDashes(result);

  // Step 2b: Repair a dangling em-dash aside left before the main verb
  result = repairAsideBeforeMainVerb(result);

  // Step 2c: Re-close em-dash appositive lists broken into "..., is/are"
  result = repairEmDashAppositiveList(result);

  // Step 3: Reduce repeated "I" sentence starts
  result = reduceRepeatedI(result);

  // Step 4: Clean up whitespace and capitalization
  result = cleanupWhitespace(result);

  // Step 5: Repair any sentence fragments left by clause splitting
  result = repairSentenceFragments(result);

  // Step 6: Repair broken list-to-verb comma splices
  result = repairCapabilityListVerb(result);

  // Step 7: Add missing "and" before a list's final item ahead of a connector
  result = repairListMissingAnd(result);

  return result;
}

/**
 * Filter an array of bullet strings — includes parallel structure breaking
 */
export function filterBullets(bullets: string[]): string[] {
  const filtered = bullets.map(b => antiAIFilter(b));
  return breakParallelBullets(filtered);
}
