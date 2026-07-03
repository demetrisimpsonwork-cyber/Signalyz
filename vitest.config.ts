import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@signalyz/scoring": path.resolve(__dirname, "./supabase/functions/_shared/scoring"),
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
    },
  },
});
