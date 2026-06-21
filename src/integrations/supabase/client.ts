import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function requireEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env locally or in Vercel Project Settings → Environment Variables.`,
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("VITE_SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    flowType: "pkce",
    // The OAuth `?code=` is exchanged explicitly in AuthCallbackHandler so we
    // can surface errors and control navigation. Automatic detection is off to
    // avoid a silent init-time exchange that consumes the PKCE code-verifier.
    detectSessionInUrl: false,
  },
});
