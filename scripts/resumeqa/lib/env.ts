import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PROJECT_REF = "hzsswurcqaxrsacseknz";

function stripQuotes(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseEnvContent(content: string): Record<string, string> {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        const key = line.slice(0, i).trim();
        const value = stripQuotes(line.slice(i + 1));
        return [key, value];
      }),
  );
}

function readPlainEnvValue(env: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const fromFile = env[key]?.trim();
    if (fromFile) return fromFile;
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

function parseJsonCliOutput(out: string): unknown {
  const trimmed = out.trim();
  if (!trimmed) {
    throw new Error("Supabase CLI returned empty output when fetching API keys.");
  }

  const jsonStart = trimmed.search(/[{[]/);
  const candidate = jsonStart >= 0 ? trimmed.slice(jsonStart).trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(
      `Supabase CLI output was not valid JSON (${detail}). Set SUPABASE_SERVICE_ROLE_KEY in .env for local dashboard scripts.`,
    );
  }
}

function resolveServiceRoleFromCliOutput(out: string): string {
  const trimmed = out.trim();
  if (!trimmed) {
    throw new Error("Supabase CLI returned empty output. Set SUPABASE_SERVICE_ROLE_KEY in .env.");
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 1 && !lines[0].startsWith("{") && !lines[0].startsWith("[")) {
    return lines[0];
  }

  const parsed = parseJsonCliOutput(trimmed) as {
    keys?: Array<{ id: string; api_key?: string }>;
  };
  const serviceRole = parsed.keys?.find((key) => key.id === "service_role")?.api_key?.trim();
  if (!serviceRole) {
    throw new Error(
      "Supabase CLI response did not include a service_role key. Set SUPABASE_SERVICE_ROLE_KEY in .env.",
    );
  }
  return serviceRole;
}

export function loadEnv(): Record<string, string> {
  try {
    return parseEnvContent(readFileSync(resolve(root, ".env"), "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw error;
  }
}

export function getSupabaseUrl(env = loadEnv()): string {
  const url = readPlainEnvValue(env, "VITE_SUPABASE_URL", "SUPABASE_URL");
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL in .env or environment.");
  }
  return url;
}

export function getServiceRoleKey(env = loadEnv()): string {
  const fromEnv = readPlainEnvValue(env, "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY");
  if (fromEnv) return fromEnv;

  let out: string;
  try {
    out = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to run Supabase CLI for service role key. Set SUPABASE_SERVICE_ROLE_KEY in .env. (${detail})`,
    );
  }

  return resolveServiceRoleFromCliOutput(out);
}

export function createServiceClient() {
  const env = loadEnv();
  const url = getSupabaseUrl(env);
  const key = getServiceRoleKey(env);
  return createClient(url, key, { auth: { persistSession: false } });
}
