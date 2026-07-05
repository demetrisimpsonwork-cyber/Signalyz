import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@signalyz/groundedCalibration": path.resolve(
        __dirname,
        "./supabase/functions/_shared/groundedCalibration.ts",
      ),
      "@signalyz/coverLetterRoleStyle": path.resolve(
        __dirname,
        "./supabase/functions/_shared/coverLetterRoleStyle.ts",
      ),
      "@signalyz/hiringReportIntegrity": path.resolve(
        __dirname,
        "./supabase/functions/_shared/hiringReportIntegrity.ts",
      ),
      "@signalyz/hiringReportJdCompaction": path.resolve(
        __dirname,
        "./supabase/functions/_shared/hiringReportJdCompaction.ts",
      ),
      "@signalyz/calibrationEngine": path.resolve(
        __dirname,
        "./supabase/functions/_shared/calibrationEngine",
      ),
      "@signalyz/resumeQaEngine": path.resolve(
        __dirname,
        "./supabase/functions/_shared/resumeQaEngine",
      ),
      "@signalyz/resumeAst": path.resolve(
        __dirname,
        "./supabase/functions/_shared/resumeAst",
      ),
    },
  },
}));
