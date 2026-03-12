/**
 * PDF Layout-Aware Text Extraction v2
 * 
 * Uses positional data from pdfjs-dist to:
 * 1. Detect single-column vs multi-column layouts (including sidebars)
 * 2. Reconstruct reading order per-column, per-vertical-block
 * 3. Detect section headers via font size, weight, and keyword matching
 * 4. Produce a structured intermediate representation before field extraction
 * 5. Output clean section-tagged text for downstream parsing
 */

// ── Core types ──────────────────────────────────────────────────────────────

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

interface TextLine {
  items: TextItem[];
  y: number;
  minX: number;
  maxX: number;
  text: string;
  avgFontSize: number;
  isBold: boolean;
  isAllCaps: boolean;
}

interface VerticalBlock {
  lines: TextLine[];
  sectionType: string | null;
  minY: number;
  maxY: number;
}

interface LayoutColumn {
  id: string; // "full-width" | "main" | "sidebar"
  minX: number;
  maxX: number;
  width: number;
  blocks: VerticalBlock[];
}

/** Structured section output */
export interface ParsedSection {
  type: string; // "header" | "summary" | "experience" | "education" | "skills" | "certifications" | "projects" | "other"
  lines: string[];
  source: string; // "main" | "sidebar" | "full-width"
}

export interface StructuredParseResult {
  sections: ParsedSection[];
  rawText: string;
  layoutType: "single-column" | "two-column" | "sidebar-left" | "sidebar-right";
  confidence: number;
}

// ── Section header detection ────────────────────────────────────────────────

const SECTION_KEYWORDS: [RegExp, string][] = [
  [/^(professional\s+summary|summary|profile|objective|about\s+me|career\s+summary|executive\s+summary)\s*$/i, "summary"],
  [/^(experience|professional\s+experience|work\s+experience|work\s+history|employment\s+history|employment|relevant\s+experience)\s*$/i, "experience"],
  [/^(education|academic\s+background|academic|qualifications?|educational\s+background)\s*$/i, "education"],
  [/^(skills|technical\s+skills|core\s+competencies|areas?\s+of\s+expertise|proficiencies|key\s+skills|competencies)\s*$/i, "skills"],
  [/^(certifications?|licenses?\s*(?:&|and)?\s*certifications?|credentials?|professional\s+certifications?)\s*$/i, "certifications"],
  [/^(projects?|independent\s+projects?|personal\s+projects?|key\s+projects?|selected\s+projects?)\s*$/i, "projects"],
  [/^(contact|personal\s+info(?:rmation)?|contact\s+info(?:rmation)?)\s*$/i, "contact"],
  [/^(awards?|honors?\s*(?:&|and)?\s*awards?|achievements?|recognition)\s*$/i, "other"],
  [/^(languages?|additional\s+info(?:rmation)?|interests?|volunteer(?:ing)?|publications?|references?)\s*$/i, "other"],
];

function matchSectionKeyword(text: string): string | null {
  const clean = text.replace(/[:\-_=│|▪•►]/g, "").trim();
  for (const [rx, type] of SECTION_KEYWORDS) {
    if (rx.test(clean)) return type;
  }
  return null;
}

// ── Extract positioned items from pdfjs page ───────────────────────────────

export function extractPositionedItems(content: any): TextItem[] {
  const items: TextItem[] = [];
  for (const item of content.items) {
    if (!item.str || item.str.trim() === "") continue;
    const tx = item.transform;
    const x = tx[4];
    const y = tx[5];
    const height = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
    const width = (item.width != null && item.width > 0)
      ? item.width
      : item.str.length * height * 0.5;
    items.push({
      str: item.str,
      x, y, width, height,
      fontName: item.fontName || "",
    });
  }
  return items;
}

// ── Group items into lines ──────────────────────────────────────────────────

function groupIntoLines(items: TextItem[], _pageHeight: number): TextLine[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom (descending Y since PDF origin is bottom-left), then left-to-right
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];
  let currentItems: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const threshold = Math.max(item.height * 0.6, 3);
    if (Math.abs(item.y - currentY) <= threshold) {
      currentItems.push(item);
    } else {
      lines.push(buildLine(currentItems));
      currentItems = [item];
      currentY = item.y;
    }
  }
  if (currentItems.length > 0) {
    lines.push(buildLine(currentItems));
  }
  return lines;
}

function buildLine(items: TextItem[]): TextLine {
  items.sort((a, b) => a.x - b.x);

  const avgY = items.reduce((s, i) => s + i.y, 0) / items.length;
  const minX = Math.min(...items.map(i => i.x));
  const maxX = Math.max(...items.map(i => i.x + i.width));

  // Compute median char width for spacing
  const charWidths = items.filter(it => it.str.length > 0).map(it => it.width / it.str.length);
  const medianCharW = charWidths.length > 0
    ? charWidths.sort((a, b) => a - b)[Math.floor(charWidths.length / 2)]
    : 5;

  // Build text with spacing
  let text = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      const gap = item.x - (prev.x + prev.width);
      if (gap > prev.height * 2) {
        text += "    "; // column-like gap within line
      } else if (gap > medianCharW * 0.3) {
        text += " ";
      }
    }
    text += item.str;
  }

  text = collapseSpacedLetters(text);

  // Detect font properties
  const avgFontSize = items.reduce((s, i) => s + i.height, 0) / items.length;
  const isBold = items.some(i =>
    /bold/i.test(i.fontName) || /black/i.test(i.fontName) || /heavy/i.test(i.fontName)
  );
  const trimmedText = text.trim();
  const isAllCaps = trimmedText.length > 2 && trimmedText === trimmedText.toUpperCase() && /[A-Z]/.test(trimmedText);

  return { items, y: avgY, minX, maxX, text: trimmedText, avgFontSize, isBold, isAllCaps };
}

function collapseSpacedLetters(text: string): string {
  return text.replace(/\b([A-Z])((?:\s[A-Z]){2,})\b/g, match => match.replace(/\s/g, ""));
}

// ── Two-column / sidebar detection ──────────────────────────────────────────

interface ColumnBoundary {
  type: "single-column" | "two-column" | "sidebar-left" | "sidebar-right";
  gutterX: number;
  leftWidth: number;
  rightWidth: number;
}

function detectColumnLayout(lines: TextLine[], pageWidth: number): ColumnBoundary {
  if (lines.length < 5) {
    return { type: "single-column", gutterX: -1, leftWidth: pageWidth, rightWidth: 0 };
  }

  // Build X-position histogram with fine granularity
  const binSize = 5;
  const bins = new Map<number, number>();
  for (const line of lines) {
    const bin = Math.round(line.minX / binSize) * binSize;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }

  // Find clusters of X start positions
  const sortedBins = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  
  // Identify dominant left-starting positions and right-starting positions
  const leftCluster: number[] = [];
  const rightCluster: number[] = [];
  const centerThreshold = pageWidth * 0.35;

  for (const [binX, count] of sortedBins) {
    if (count >= 2) {
      if (binX < centerThreshold) {
        leftCluster.push(binX);
      } else if (binX > centerThreshold) {
        rightCluster.push(binX);
      }
    }
  }

  // Count lines per cluster
  const leftLineCount = lines.filter(l => l.minX < centerThreshold && l.maxX < pageWidth * 0.65).length;
  const rightLineCount = lines.filter(l => l.minX >= centerThreshold).length;
  const fullWidthCount = lines.filter(l => (l.maxX - l.minX) > pageWidth * 0.6).length;

  // Need significant content in both sides for two-column
  if (leftLineCount < 4 || rightLineCount < 4) {
    return { type: "single-column", gutterX: -1, leftWidth: pageWidth, rightWidth: 0 };
  }

  // If most lines are full-width, it's single column
  if (fullWidthCount > lines.length * 0.5) {
    return { type: "single-column", gutterX: -1, leftWidth: pageWidth, rightWidth: 0 };
  }

  // Find the gutter: largest gap between right edges of left-column lines and left edges of right-column lines
  const leftMaxXs = lines
    .filter(l => l.minX < centerThreshold && l.maxX < pageWidth * 0.7)
    .map(l => l.maxX);
  const rightMinXs = lines
    .filter(l => l.minX >= centerThreshold)
    .map(l => l.minX);

  if (leftMaxXs.length === 0 || rightMinXs.length === 0) {
    return { type: "single-column", gutterX: -1, leftWidth: pageWidth, rightWidth: 0 };
  }

  // Use median right-edge of left lines and median left-edge of right lines
  leftMaxXs.sort((a, b) => a - b);
  rightMinXs.sort((a, b) => a - b);
  const medianLeftMax = leftMaxXs[Math.floor(leftMaxXs.length / 2)];
  const medianRightMin = rightMinXs[Math.floor(rightMinXs.length / 2)];

  const gutterWidth = medianRightMin - medianLeftMax;
  if (gutterWidth < 10) {
    return { type: "single-column", gutterX: -1, leftWidth: pageWidth, rightWidth: 0 };
  }

  const gutterX = (medianLeftMax + medianRightMin) / 2;
  const leftWidth = gutterX;
  const rightWidth = pageWidth - gutterX;

  // Classify: sidebar (narrow column < 38% of page) vs equal two-column
  const narrowRatio = Math.min(leftWidth, rightWidth) / pageWidth;
  if (narrowRatio < 0.38) {
    if (leftWidth < rightWidth) {
      return { type: "sidebar-left", gutterX, leftWidth, rightWidth };
    } else {
      return { type: "sidebar-right", gutterX, leftWidth, rightWidth };
    }
  }

  return { type: "two-column", gutterX, leftWidth, rightWidth };
}

// ── Assign lines to columns ─────────────────────────────────────────────────

function assignLinesToColumns(
  lines: TextLine[],
  layout: ColumnBoundary,
  pageWidth: number
): { fullWidth: TextLine[]; left: TextLine[]; right: TextLine[] } {
  if (layout.type === "single-column") {
    return { fullWidth: lines, left: [], right: [] };
  }

  const fullWidth: TextLine[] = [];
  const left: TextLine[] = [];
  const right: TextLine[] = [];

  for (const line of lines) {
    const lineWidth = line.maxX - line.minX;
    const lineCenter = (line.minX + line.maxX) / 2;

    // Full-width: spans across gutter significantly
    if (lineWidth > pageWidth * 0.55 || (line.minX < layout.gutterX * 0.5 && line.maxX > layout.gutterX * 1.3)) {
      fullWidth.push(line);
    } else if (lineCenter < layout.gutterX) {
      left.push(line);
    } else {
      right.push(line);
    }
  }

  return { fullWidth, left, right };
}

// ── Segment column lines into vertical blocks by section headers ────────────

function segmentIntoBlocks(lines: TextLine[], medianFontSize: number): VerticalBlock[] {
  if (lines.length === 0) return [];

  // Sort top-to-bottom (descending Y)
  const sorted = [...lines].sort((a, b) => b.y - a.y);

  const blocks: VerticalBlock[] = [];
  let currentLines: TextLine[] = [];
  let currentSection: string | null = null;

  for (const line of sorted) {
    const sectionMatch = matchSectionKeyword(line.text);
    const isLikelyHeader = sectionMatch !== null ||
      (line.isBold && line.isAllCaps && line.text.length < 40 && line.text.length > 2) ||
      (line.avgFontSize > medianFontSize * 1.15 && line.text.length < 50 && line.isAllCaps);

    if (isLikelyHeader && sectionMatch) {
      // Flush current block
      if (currentLines.length > 0) {
        blocks.push(makeBlock(currentLines, currentSection));
      }
      currentSection = sectionMatch;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    blocks.push(makeBlock(currentLines, currentSection));
  }

  return blocks;
}

function makeBlock(lines: TextLine[], sectionType: string | null): VerticalBlock {
  const ys = lines.map(l => l.y);
  return {
    lines,
    sectionType,
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// ── Infer section type for untagged blocks ──────────────────────────────────

const DATE_PATTERN = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(\d{4})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(present|current|\d{4})/i;
const YEAR_ONLY = /\b(20\d{2}|19\d{2})\b/;
const ROLE_TITLES_RX = /\b(specialist|manager|analyst|coordinator|engineer|developer|director|lead|supervisor|associate|consultant|administrator|architect|designer|officer|president|vice\s+president|vp|intern|assistant|head\s+of)\b/i;
const COMPANY_SUFFIXES_RX = /\b(inc|llc|corp|ltd|co|solutions|technologies|group|partners|consulting|associates|services|global|systems)\b/i;
const EDUCATION_KEYWORDS_RX = /\b(university|college|bachelor|master|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|ph\.?d|associate|diploma|gpa|degree|school|institute)\b/i;
const EMAIL_RX = /[\w.+-]+@[\w.-]+\.\w{2,}/;
const PHONE_RX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const ACTION_VERBS = new Set([
  "led","managed","owned","built","created","developed","designed","implemented",
  "improved","executed","coordinated","supported","resolved","reduced","increased",
  "streamlined","analyzed","communicated","partnered","trained","automated",
  "documented","delivered","oversaw","directed","established","facilitated",
  "negotiated","optimized","spearheaded","launched","maintained","monitored",
  "organized","planned","produced","provided","reported","supervised","tracked",
]);

function inferBlockSection(block: VerticalBlock, source: string): string {
  if (block.sectionType) return block.sectionType;

  const texts = block.lines.map(l => l.text);
  let expScore = 0, eduScore = 0, skillScore = 0, contactScore = 0, summaryScore = 0;

  for (const t of texts) {
    if (DATE_PATTERN.test(t)) expScore += 3;
    if (COMPANY_SUFFIXES_RX.test(t)) expScore += 2;
    if (ROLE_TITLES_RX.test(t)) expScore += 2;
    const firstWord = t.replace(/^[-•]\s*/, "").split(/\s/)[0]?.toLowerCase();
    if (ACTION_VERBS.has(firstWord || "")) expScore += 1;
    if (EDUCATION_KEYWORDS_RX.test(t)) eduScore += 3;
    if ((t.match(/,/g) || []).length >= 3 && t.length < 200) skillScore += 3;
    if (EMAIL_RX.test(t) || PHONE_RX.test(t)) contactScore += 3;
    if (t.length > 120 && !DATE_PATTERN.test(t)) summaryScore += 2;
  }

  // Sidebar blocks with skills/contact are common
  if (source === "sidebar") {
    skillScore *= 1.3;
    contactScore *= 1.3;
  }

  const scores: [string, number][] = [
    ["experience", expScore],
    ["education", eduScore],
    ["skills", skillScore],
    ["contact", contactScore],
    ["summary", summaryScore],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "other";
}

// ── Clean text artifacts ────────────────────────────────────────────────────

function cleanArtifacts(text: string): string {
  let t = text;
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\uFEFF\u00AD]/g, "");
  t = t.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff").replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl");
  t = t.replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, '"');
  t = t.replace(/\s+([.,;:!?])/g, "$1");
  // CamelCase splitting
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
  t = t.replace(/([A-Z][a-z]+)([A-Z])/g, "$1 $2");
  // All-caps concatenated title keywords
  t = t.replace(
    /(?<=\w)(DIRECTOR|MANAGER|SPECIALIST|ANALYST|ENGINEER|COORDINATOR|SUPERVISOR|CONSULTANT|OFFICER|PRESIDENT|EDUCATION|EXPERIENCE|SKILLS|SUMMARY|CERTIFICATIONS?|HUMAN|RESOURCES|OPERATIONS|MARKETING|FINANCE|TECHNOLOGY|INFORMATION)/g,
    " $1"
  );
  t = t.replace(/[ \t]+/g, " ");
  return t;
}

function normalizeBullets(text: string): string {
  return text
    .replace(/[•●◦▪■◆►▸▹✦✧○◇★☆✓✔→⇒➤➢⮞·›»]/g, "-")
    .replace(/^\s*[-]\s*/gm, "- ");
}

// ── Build structured intermediate output ────────────────────────────────────

function buildStructuredOutput(
  fullWidthBlocks: VerticalBlock[],
  mainBlocks: VerticalBlock[],
  sidebarBlocks: VerticalBlock[],
  layoutType: ColumnBoundary["type"]
): StructuredParseResult {
  const sections: ParsedSection[] = [];

  // Process full-width blocks first (typically header/name)
  for (const block of fullWidthBlocks) {
    const type = inferBlockSection(block, "full-width");
    const lines = block.lines.map(l => cleanArtifacts(l.text)).filter(Boolean);
    if (lines.length > 0) {
      // If first block has no section header, treat as header/contact
      const finalType = (sections.length === 0 && type === "other") ? "header" : type;
      sections.push({ type: finalType, lines, source: "full-width" });
    }
  }

  // Process main content column
  for (const block of mainBlocks) {
    const type = inferBlockSection(block, "main");
    const lines = block.lines.map(l => cleanArtifacts(l.text)).filter(Boolean);
    if (lines.length > 0) {
      sections.push({ type, lines, source: "main" });
    }
  }

  // Process sidebar column
  for (const block of sidebarBlocks) {
    const type = inferBlockSection(block, "sidebar");
    const lines = block.lines.map(l => cleanArtifacts(l.text)).filter(Boolean);
    if (lines.length > 0) {
      sections.push({ type, lines, source: "sidebar" });
    }
  }

  // Build raw text in proper reading order
  const allLines: string[] = [];
  for (const sec of sections) {
    // Add section marker for downstream parsing
    if (sec.type !== "header" && sec.type !== "other" && sec.type !== "contact") {
      const headerLabel = sec.type.toUpperCase();
      allLines.push("", headerLabel, "");
    }
    for (const line of sec.lines) {
      allLines.push(normalizeBullets(line));
    }
  }

  // Compute confidence
  const hasExperience = sections.some(s => s.type === "experience");
  const hasEducation = sections.some(s => s.type === "education");
  const hasContact = sections.some(s => s.type === "header" || s.type === "contact");
  const totalLines = sections.reduce((s, sec) => s + sec.lines.length, 0);
  let confidence = 0.5;
  if (hasExperience) confidence += 0.2;
  if (hasEducation) confidence += 0.1;
  if (hasContact) confidence += 0.1;
  if (totalLines > 20) confidence += 0.1;

  const rawText = allLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { sections, rawText, layoutType, confidence };
}

// ── Main entry point ────────────────────────────────────────────────────────

export function reconstructPdfText(pages: { content: any; viewport: any }[]): string {
  const result = reconstructPdfStructured(pages);
  return result.rawText;
}

/**
 * Full structured parse — returns sections + layout metadata.
 * Called by the upload pipeline for richer downstream processing.
 */
export function reconstructPdfStructured(pages: { content: any; viewport: any }[]): StructuredParseResult {
  if (pages.length === 0) {
    return { sections: [], rawText: "", layoutType: "single-column", confidence: 0 };
  }

  const allSections: ParsedSection[] = [];
  let overallLayout: ColumnBoundary["type"] = "single-column";

  for (const { content, viewport } of pages) {
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    // Step 1: Extract positioned items
    const items = extractPositionedItems(content);
    if (items.length === 0) continue;

    // Step 2: Group into lines
    const lines = groupIntoLines(items, pageHeight);
    if (lines.length === 0) continue;

    // Compute median font size for header detection
    const fontSizes = lines.map(l => l.avgFontSize).sort((a, b) => a - b);
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

    // Step 3: Detect layout
    const layout = detectColumnLayout(lines, pageWidth);
    if (layout.type !== "single-column") {
      overallLayout = layout.type;
    }

    // Step 4: Assign lines to columns
    const { fullWidth, left, right } = assignLinesToColumns(lines, layout, pageWidth);

    // Step 5: Segment each column into vertical blocks by section headers
    const fullWidthBlocks = segmentIntoBlocks(fullWidth, medianFontSize);

    let mainLines: TextLine[];
    let sidebarLines: TextLine[];

    if (layout.type === "sidebar-left") {
      mainLines = right;
      sidebarLines = left;
    } else if (layout.type === "sidebar-right") {
      mainLines = left;
      sidebarLines = right;
    } else if (layout.type === "two-column") {
      // For true two-column: left is first, right is second (top-to-bottom per column)
      mainLines = left;
      sidebarLines = right;
    } else {
      mainLines = [...left, ...right].sort((a, b) => b.y - a.y);
      sidebarLines = [];
    }

    const mainBlocks = segmentIntoBlocks(mainLines, medianFontSize);
    const sidebarBlocks = segmentIntoBlocks(sidebarLines, medianFontSize);

    // Step 6: Build structured output for this page
    const pageResult = buildStructuredOutput(fullWidthBlocks, mainBlocks, sidebarBlocks, layout.type);
    allSections.push(...pageResult.sections);
  }

  // Merge all pages into final result
  const allLines: string[] = [];
  
  // Order: header/contact first, then main sections, then sidebar sections
  const headerSections = allSections.filter(s => s.type === "header" || s.type === "contact");
  const mainSections = allSections.filter(s => s.source !== "sidebar" && s.type !== "header" && s.type !== "contact");
  const sidebarSections = allSections.filter(s => s.source === "sidebar" && s.type !== "header" && s.type !== "contact");

  // Prioritize main content sections in resume-standard order
  const sectionOrder = ["summary", "experience", "projects", "education", "skills", "certifications", "other"];

  // Header first
  for (const sec of headerSections) {
    for (const line of sec.lines) allLines.push(line);
  }

  // Main sections in standard order
  for (const sectionType of sectionOrder) {
    const matching = mainSections.filter(s => s.type === sectionType);
    for (const sec of matching) {
      const label = sec.type.toUpperCase();
      if (sec.type !== "other") allLines.push("", label);
      for (const line of sec.lines) allLines.push(normalizeBullets(line));
    }
  }

  // Sidebar sections (skills, contact, etc.) appended after main
  for (const sectionType of sectionOrder) {
    const matching = sidebarSections.filter(s => s.type === sectionType);
    for (const sec of matching) {
      const label = sec.type.toUpperCase();
      if (sec.type !== "other") allLines.push("", label);
      for (const line of sec.lines) allLines.push(normalizeBullets(line));
    }
  }

  let rawText = allLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Final cleanup pass
  rawText = deHyphenate(rawText);
  rawText = forceSectionBreaks(rawText);
  rawText = stripContactLines(rawText);
  rawText = rawText.split("\n").map(l => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const hasExp = allSections.some(s => s.type === "experience");
  const hasEdu = allSections.some(s => s.type === "education");
  const hasHeader = allSections.some(s => s.type === "header" || s.type === "contact");
  let confidence = 0.5;
  if (hasExp) confidence += 0.2;
  if (hasEdu) confidence += 0.1;
  if (hasHeader) confidence += 0.1;
  if (allSections.reduce((s, sec) => s + sec.lines.length, 0) > 20) confidence += 0.1;

  return {
    sections: [...headerSections, ...mainSections, ...sidebarSections],
    rawText,
    layoutType: overallLayout,
    confidence,
  };
}

// ── Utility functions ───────────────────────────────────────────────────────

function deHyphenate(text: string): string {
  return text.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2");
}

const SECTION_HEADER_STANDALONE_RE =
  /\b(EDUCATION|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|EXPERIENCE|SKILLS|TECHNICAL\s+SKILLS|CORE\s+COMPETENCIES|LANGUAGES|CONTACT|SUMMARY|PROFESSIONAL\s+SUMMARY|PROFILE|OBJECTIVE|CERTIFICATIONS?|LICENSES?|CREDENTIALS?|EMPLOYMENT|QUALIFICATIONS?|PROJECTS?)\b/i;

function forceSectionBreaks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(""); continue; }
    const match = trimmed.match(SECTION_HEADER_STANDALONE_RE);
    if (match) {
      const idx = trimmed.indexOf(match[0]);
      const before = trimmed.slice(0, idx).trim();
      const after = trimmed.slice(idx + match[0].length).replace(/^[\s:\-_=]+/, "").trim();
      if (before) out.push(before);
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(match[0].trim());
      if (after) out.push(after);
    } else {
      out.push(trimmed);
    }
  }
  return out.join("\n");
}

const CONTACT_EMAIL_RX = /[\w.+-]+@[\w.-]+\.\w{2,}/;
const CONTACT_PHONE_RX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const CONTACT_ADDRESS_RX = /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|way|circle|cir)\b/i;
const CONTACT_LINKEDIN_RX = /linkedin\.com\/in\//i;

function stripContactLines(text: string): string {
  const lines = text.split("\n");
  let pastFirstSection = false;
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!pastFirstSection && SECTION_HEADER_STANDALONE_RE.test(trimmed)) {
      pastFirstSection = true;
    }
    if (!pastFirstSection) { out.push(line); continue; }
    if (isContactOnlyLine(trimmed)) continue;
    out.push(line);
  }
  return out.join("\n");
}

function isContactOnlyLine(line: string): boolean {
  if (!line || line.length > 120) return false;
  let remaining = line
    .replace(CONTACT_EMAIL_RX, "")
    .replace(CONTACT_PHONE_RX, "")
    .replace(CONTACT_ADDRESS_RX, "")
    .replace(CONTACT_LINKEDIN_RX, "")
    .replace(/[|,;•·\-–—\s]/g, "")
    .trim();
  if (remaining.length === 0 && (
    CONTACT_EMAIL_RX.test(line) ||
    CONTACT_PHONE_RX.test(line) ||
    CONTACT_ADDRESS_RX.test(line) ||
    CONTACT_LINKEDIN_RX.test(line)
  )) {
    return true;
  }
  return false;
}
