/** Lightweight PDF metadata extraction from bytes — no external PDF parser. */
export function extractPdfPageCount(bytes: ArrayBuffer): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const countMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
  if (countMatch) return Number(countMatch[1]);
  const pages = text.match(/\/Type\s*\/Page\b/g);
  return pages?.length ?? null;
}

export function extractPdfPlainText(bytes: ArrayBuffer): string {
  const text = new TextDecoder("latin1").decode(bytes);
  const chunks = [...text.matchAll(/\(([^()\\]{2,120})\)/g)].map((m) => m[1] ?? "");
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export function isPdfValidationAvailable(): boolean {
  return true;
}
