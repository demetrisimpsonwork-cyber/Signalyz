import DOMPurify from "dompurify";

/**
 * Strip all HTML tags from user input text.
 * Used for resume text, JD text, and any freeform input.
 */
export function stripHtml(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

/**
 * Sanitize HTML content for safe rendering with dangerouslySetInnerHTML.
 * Only allows basic text formatting tags.
 */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "br", "span"],
    ALLOWED_ATTR: [],
  });
}

/**
 * Input character limits for the application.
 */
export const INPUT_LIMITS = {
  RESUME: 15000,
  JD: 10000,
  LINKEDIN: 2000,
  NAME: 200,
  EMAIL: 200,
  PHONE: 200,
  ADDITIONAL_CONTEXT: 2000,
} as const;

/**
 * Enforce character limit on input text.
 */
export function enforceLimit(text: string, limit: number): string {
  return text.slice(0, limit);
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate file upload: type and size.
 */
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type as any)) {
    // Also check extension as fallback
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      return { valid: false, error: "Only PDF and DOCX files are accepted." };
    }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size must be under 5MB." };
  }
  return { valid: true };
}
