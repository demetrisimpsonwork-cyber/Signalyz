/**
 * PDF Column-Aware Text Extraction
 * 
 * Handles multi-column, sidebar, and designed resume layouts by using
 * spatial positioning data from pdfjs-dist to reconstruct natural reading order.
 */

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
  y: number;          // average Y position
  minX: number;
  maxX: number;
  text: string;
}

interface Column {
  minX: number;
  maxX: number;
  lines: TextLine[];
}

// ── Extract positioned items from a pdfjs page ──────────────────────────────

export function extractPositionedItems(content: any): TextItem[] {
  const items: TextItem[] = [];

  for (const item of content.items) {
    if (!item.str || item.str.trim() === "") continue;

    const tx = item.transform;
    // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
    const x = tx[4];
    const y = tx[5];
    const height = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
    const width = item.width || item.str.length * height * 0.5;

    items.push({
      str: item.str,
      x,
      y,
      width,
      height,
      fontName: item.fontName || "",
    });
  }

  return items;
}

// ── Group items into lines based on Y proximity ─────────────────────────────

function groupIntoLines(items: TextItem[], pageHeight: number): TextLine[] {
  if (items.length === 0) return [];

  // Sort by Y descending (PDF origin is bottom-left), then by X ascending
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];
  let currentLineItems: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    // Items within ~60% of font height are on the same line
    const threshold = Math.max(item.height * 0.6, 3);

    if (Math.abs(item.y - currentY) <= threshold) {
      currentLineItems.push(item);
    } else {
      lines.push(buildLine(currentLineItems));
      currentLineItems = [item];
      currentY = item.y;
    }
  }

  if (currentLineItems.length > 0) {
    lines.push(buildLine(currentLineItems));
  }

  return lines;
}

function buildLine(items: TextItem[]): TextLine {
  // Sort items left to right within the line
  items.sort((a, b) => a.x - b.x);

  const avgY = items.reduce((s, i) => s + i.y, 0) / items.length;
  const minX = Math.min(...items.map((i) => i.x));
  const maxX = Math.max(...items.map((i) => i.x + i.width));

  // Compute median character width for this line to detect spacing
  const charWidths = items
    .filter((it) => it.str.length > 0)
    .map((it) => it.width / it.str.length);
  const medianCharW = charWidths.length > 0
    ? charWidths.sort((a, b) => a - b)[Math.floor(charWidths.length / 2)]
    : 5;

  // Join items with appropriate spacing
  let text = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      const gap = item.x - (prev.x + prev.width);
      // Large gap = tab/column separator within line
      if (gap > prev.height * 2) {
        text += "    ";
      } else if (gap > medianCharW * 0.3) {
        // Normal word space — use character-width metric instead of font height
        text += " ";
      }
      // Tiny/negative gap = same word, no space needed
    }
    text += item.str;
  }

  // Post-process: collapse spaced-out capital letters (e.g. "E D U C A T I O N" → "EDUCATION")
  text = collapseSpacedLetters(text);

  return { items, y: avgY, minX, maxX, text: text.trim() };
}

/**
 * Collapse sequences of single uppercase letters separated by spaces
 * into a single word. Handles headers like "E D U C A T I O N" → "EDUCATION"
 * and "S K I L L S" → "SKILLS". Only collapses runs of 3+ single chars.
 */
function collapseSpacedLetters(text: string): string {
  // Match 3+ single uppercase letters separated by single spaces
  return text.replace(
    /\b([A-Z])((?:\s[A-Z]){2,})\b/g,
    (match) => match.replace(/\s/g, "")
  );
}

// ── Detect columns ──────────────────────────────────────────────────────────

function detectColumns(lines: TextLine[], pageWidth: number): Column[] {
  if (lines.length < 3) {
    return [{ minX: 0, maxX: pageWidth, lines }];
  }

  // Collect X start positions of all lines
  const xStarts = lines.map((l) => l.minX);
  const xEnds = lines.map((l) => l.maxX);

  // Find the page center region
  const pageCenter = pageWidth / 2;
  const centerBand = pageWidth * 0.08; // 8% tolerance band

  // Count lines that start in the left half vs right half
  const leftLines = lines.filter((l) => l.minX < pageCenter - centerBand);
  const rightLines = lines.filter((l) => l.minX > pageCenter - centerBand && l.minX < pageWidth * 0.85);
  
  // Check if there are lines starting distinctly in the right half
  const rightStartLines = lines.filter((l) => l.minX > pageCenter * 0.8 && l.maxX < pageWidth * 1.05);
  
  // Determine if this is a two-column layout
  const hasLeftContent = leftLines.length > 3;
  const hasRightContent = rightStartLines.length > 3;

  // Check for a clear gap in X positions (column gutter)
  const sortedXStarts = [...new Set(xStarts.map((x) => Math.round(x / 5) * 5))].sort((a, b) => a - b);
  
  let gutterX = -1;
  if (hasLeftContent && hasRightContent) {
    // Find the largest gap in X start positions near center
    for (let i = 1; i < sortedXStarts.length; i++) {
      const gap = sortedXStarts[i] - sortedXStarts[i - 1];
      const pos = (sortedXStarts[i] + sortedXStarts[i - 1]) / 2;
      if (gap > 30 && pos > pageWidth * 0.2 && pos < pageWidth * 0.8) {
        gutterX = pos;
        break;
      }
    }
  }

  // Also detect sidebar layouts (narrow column on left or right)
  if (gutterX < 0) {
    // Check for a narrow sidebar (< 35% of page width)
    const leftMax = Math.max(...leftLines.map((l) => l.maxX), 0);
    const rightMin = rightStartLines.length > 0 ? Math.min(...rightStartLines.map((l) => l.minX)) : pageWidth;
    
    if (rightMin - leftMax > 20 && leftMax < pageWidth * 0.4 && rightStartLines.length > 3) {
      gutterX = (leftMax + rightMin) / 2;
    } else if (rightMin - leftMax > 20 && rightMin > pageWidth * 0.55 && leftLines.length > 3) {
      gutterX = (leftMax + rightMin) / 2;
    }
  }

  if (gutterX < 0) {
    // Single column
    return [{ minX: 0, maxX: pageWidth, lines }];
  }

  // Split into two columns
  const col1Lines: TextLine[] = [];
  const col2Lines: TextLine[] = [];
  const fullWidthLines: TextLine[] = [];

  for (const line of lines) {
    const lineCenter = (line.minX + line.maxX) / 2;
    const lineWidth = line.maxX - line.minX;

    // Full-width lines span across the gutter
    if (lineWidth > pageWidth * 0.6) {
      fullWidthLines.push(line);
    } else if (lineCenter < gutterX) {
      col1Lines.push(line);
    } else {
      col2Lines.push(line);
    }
  }

  const columns: Column[] = [];

  // Full-width lines first (usually header/name)
  if (fullWidthLines.length > 0) {
    columns.push({ minX: 0, maxX: pageWidth, lines: fullWidthLines });
  }

  // Main content column first (usually the wider one)
  const col1Width = col1Lines.length > 0 ? Math.max(...col1Lines.map((l) => l.maxX)) - Math.min(...col1Lines.map((l) => l.minX)) : 0;
  const col2Width = col2Lines.length > 0 ? Math.max(...col2Lines.map((l) => l.maxX)) - Math.min(...col2Lines.map((l) => l.minX)) : 0;

  // Determine which column is "main" (wider = main content, narrower = sidebar)
  if (col1Width >= col2Width) {
    if (col1Lines.length > 0) columns.push({ minX: 0, maxX: gutterX, lines: col1Lines });
    if (col2Lines.length > 0) columns.push({ minX: gutterX, maxX: pageWidth, lines: col2Lines });
  } else {
    if (col2Lines.length > 0) columns.push({ minX: gutterX, maxX: pageWidth, lines: col2Lines });
    if (col1Lines.length > 0) columns.push({ minX: 0, maxX: gutterX, lines: col1Lines });
  }

  return columns;
}

// ── Resume section detection for ordering ───────────────────────────────────

const SECTION_PRIORITY: Record<string, number> = {
  contact: 0,
  summary: 1,
  experience: 2,
  education: 3,
  skills: 4,
  certifications: 5,
  other: 6,
};

const SECTION_HEADERS_RE: [RegExp, string][] = [
  [/^(professional\s+summary|summary|profile|objective|about\s+me)/i, "summary"],
  [/^(experience|professional\s+experience|work\s+experience|work\s+history|employment)/i, "experience"],
  [/^(education|academic|qualifications?)/i, "education"],
  [/^(skills|technical\s+skills|core\s+competencies|areas?\s+of\s+expertise|proficiencies)/i, "skills"],
  [/^(certifications?|licenses?|credentials?)/i, "certifications"],
  [/^(projects?|independent\s+projects?|personal\s+projects?)/i, "experience"],
  [/^(contact|personal\s+info)/i, "contact"],
];

function detectSectionType(text: string): string | null {
  const clean = text.replace(/[:\-_=]/g, "").trim();
  for (const [rx, type] of SECTION_HEADERS_RE) {
    if (rx.test(clean)) return type;
  }
  return null;
}

// ── Normalize bullet characters ─────────────────────────────────────────────

function normalizeBullets(text: string): string {
  // Convert various bullet characters to standard dash
  return text
    .replace(/[•●◦▪■◆►▸▹✦✧○◇★☆✓✔→⇒➤➢⮞·›»]/g, "-")
    .replace(/^\s*[-]\s*/gm, "- ");
}

// ── Clean PDF artifacts ─────────────────────────────────────────────────────

function cleanArtifacts(text: string): string {
  let t = text;

  // Remove control characters and zero-width chars
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\uFEFF\u00AD]/g, "");

  // Fix common ligature issues
  t = t.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff").replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl");

  // Fix broken quotes
  t = t.replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, '"');

  // Remove excessive whitespace within lines
  t = t.replace(/[^\S\n]{3,}/g, "  ");

  // Fix orphaned punctuation from extraction
  t = t.replace(/\s+([.,;:!?])/g, "$1");

  // Fix broken words from character-by-character extraction
  // Pattern: single chars separated by spaces that form a word
  t = t.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\s+([A-Z])\b/g, (match) => {
    const word = match.replace(/\s+/g, "");
    // Only collapse if it looks like a word (not an acronym in context)
    return word.length <= 6 ? word : match;
  });

  // Collapse multiple spaces
  t = t.replace(/[ \t]+/g, " ");

  // Normalize line endings
  t = t.replace(/\r\n?/g, "\n");
  t = t.replace(/\n{4,}/g, "\n\n\n");

  return t;
}

// ── De-hyphenate broken words ───────────────────────────────────────────────

function deHyphenate(text: string): string {
  return text.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2");
}

// ── Main: Parse PDF pages into clean resume text ────────────────────────────

export function reconstructPdfText(pages: { content: any; viewport: any }[]): string {
  const allPageTexts: string[] = [];

  for (const { content, viewport } of pages) {
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    // Step 1: Extract positioned items
    const items = extractPositionedItems(content);
    if (items.length === 0) continue;

    // Step 2: Group into lines
    const lines = groupIntoLines(items, pageHeight);
    if (lines.length === 0) continue;

    // Step 3: Detect columns
    const columns = detectColumns(lines, pageWidth);

    // Step 4: Build text from columns in order
    const pageLines: string[] = [];

    for (const col of columns) {
      // Lines within a column are already sorted by Y (top to bottom = descending Y)
      const sortedLines = [...col.lines].sort((a, b) => b.y - a.y);

      for (const line of sortedLines) {
        const trimmed = line.text.trim();
        if (trimmed) {
          pageLines.push(trimmed);
        }
      }

      // Add separator between columns
      pageLines.push("");
    }

    allPageTexts.push(pageLines.join("\n"));
  }

  let result = allPageTexts.join("\n\n");

  // Step 5: Post-processing
  result = cleanArtifacts(result);
  result = normalizeBullets(result);
  result = deHyphenate(result);

  // Final cleanup: trim lines, remove excessive blank lines
  result = result
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}
