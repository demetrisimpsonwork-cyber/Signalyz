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
    // Exchange the OAuth redirect (`?code=...`) for a session on page load
    // so Google sign-in works on Vercel and the custom domain.
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
