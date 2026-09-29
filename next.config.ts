import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Calibration and the demo seeder read files at runtime, which makes the tracer include the
  // whole project. Keep private and local material out of every server bundle.
  outputFileTracingExcludes: {
    "/*": ["./source/**/*", "./.data/**/*", "./docs/**/*", "./tests/**/*", "./scripts/**/*", "./supabase/**/*", "./.env*"],
  },
  outputFileTracingIncludes: {
    "/api/demo/seed": ["./fixtures/synthetic/**/*"],
  },
};

export default nextConfig;
