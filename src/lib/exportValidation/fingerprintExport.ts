/** SHA-256 fingerprint of export artifact bytes (Web Crypto only — safe for browser bundle). */
export async function fingerprintExportBytes(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("SHA-256 unavailable in this environment");
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
