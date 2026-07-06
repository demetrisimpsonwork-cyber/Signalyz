/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_ENABLE_CALIBRATION_V2_SHADOW?: string;
  readonly VITE_ENABLE_RESUME_QA_SHADOW?: string;
  readonly VITE_ENABLE_RESUME_AST_SHADOW?: string;
  readonly VITE_ENABLE_EXPORT_VALIDATION_SHADOW?: string;
  readonly VITE_ENABLE_SIGNALYZED_STANDARD_SHADOW?: string;
  readonly VITE_ENABLE_REPAIR_SANDBOX_SHADOW?: string;
  readonly VITE_USE_ALIGNMENT_SNAPSHOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
