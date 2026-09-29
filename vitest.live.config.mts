import { defineConfig } from "vitest/config";
import path from "node:path";

// Live checks against real Supabase, Gemini, and Resend. Run explicitly: npm run test:live
export default defineConfig({
  test: { environment: "node", include: ["tests/live/**/*.test.ts"], testTimeout: 300000, hookTimeout: 300000, fileParallelism: false },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
