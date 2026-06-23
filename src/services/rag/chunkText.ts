import type { ChunkTextOptions, TextChunk } from "./types";

const DEFAULT_MAX_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function splitIntoSegments(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function takeTailOverlap(content: string, overlap: number): string {
  if (overlap <= 0 || content.length <= overlap) {
    return content;
  }

  return content.slice(-overlap).trimStart();
}

/**
 * Splits long text into overlapping chunks suitable for embedding and retrieval.
 */
export function chunkText(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const maxChunkSize = options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const chunkOverlap = Math.min(
    options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
    Math.max(maxChunkSize - 1, 0),
  );

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChunkSize) {
    return [{ index: 0, content: normalized }];
  }

  const segments = splitIntoSegments(normalized);
  const chunks: TextChunk[] = [];
  let buffer = "";

  const flush = () => {
    const content = buffer.trim();
    if (!content) {
      return;
    }

    chunks.push({ index: chunks.length, content });
    buffer = takeTailOverlap(content, chunkOverlap);
  };

  for (const segment of segments) {
    const candidate = buffer ? `${buffer} ${segment}`.trim() : segment;

    if (candidate.length <= maxChunkSize) {
      buffer = candidate;
      continue;
    }

    if (buffer) {
      flush();
    }

    if (segment.length <= maxChunkSize) {
      buffer = segment;
      continue;
    }

    let offset = 0;
    while (offset < segment.length) {
      const slice = segment.slice(offset, offset + maxChunkSize).trim();
      if (slice) {
        chunks.push({ index: chunks.length, content: slice });
      }
      offset += maxChunkSize - chunkOverlap;
      if (chunkOverlap === 0) {
        break;
      }
    }

    buffer = "";
  }

  if (buffer.trim()) {
    chunks.push({ index: chunks.length, content: buffer.trim() });
  }

  return chunks.map((chunk, index) => ({ ...chunk, index }));
}
