import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
