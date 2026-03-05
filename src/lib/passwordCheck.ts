/**
 * Check if a password has been found in known data breaches
 * using the HaveIBeenPwned Passwords API (k-anonymity model).
 * Only the first 5 chars of the SHA-1 hash are sent — the full
 * password never leaves the client.
 */
export async function isPasswordLeaked(password: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return false; // fail open — don't block signup if API is down

    const text = await res.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const [hash, count] = line.split(":");
      if (hash.trim() === suffix) {
        return parseInt(count.trim(), 10) > 0;
      }
    }
    return false;
  } catch {
    return false; // fail open
  }
}
