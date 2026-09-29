import "server-only";

const env = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};

export type DataMode = "supabase" | "local-demo";
export type AIMode = "gemini" | "simulated";
export type EmailMode = "resend-test" | "simulated";

export interface AppConfig {
  data: DataMode;
  ai: AIMode;
  email: EmailMode;
  geminiModel: string;
  emailFrom: string | null;
  testAllowlist: string[];
  defaultTestRecipient: string | null;
  founderEmails: string[];
  problems: string[];
}

export function getConfig(): AppConfig {
  const problems: string[] = [];
  const hasSupabase = Boolean(env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY") && env("SUPABASE_SERVICE_ROLE_KEY"));
  const testAllowlist = (env("EMAIL_TEST_ALLOWLIST") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const deliveryMode = env("EMAIL_DELIVERY_MODE") ?? "test";
  if (deliveryMode !== "test") problems.push(`EMAIL_DELIVERY_MODE="${deliveryMode}" is not supported in this build. Only test delivery is enabled.`);

  let email: EmailMode = "simulated";
  if (env("RESEND_API_KEY")) {
    if (!env("EMAIL_FROM")) problems.push("RESEND_API_KEY is set but EMAIL_FROM is missing, so email stays simulated.");
    else if (testAllowlist.length === 0) problems.push("RESEND_API_KEY is set but EMAIL_TEST_ALLOWLIST is empty, so email stays simulated.");
    else email = "resend-test";
  }

  const founderEmails = (env("FOUNDER_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (hasSupabase && founderEmails.length === 0) problems.push("FOUNDER_EMAILS is empty: nobody can sign in.");

  return {
    data: hasSupabase ? "supabase" : "local-demo",
    ai: env("GEMINI_API_KEY") ? "gemini" : "simulated",
    email,
    geminiModel: env("GEMINI_MODEL") ?? "gemini-3.8-flash",
    emailFrom: env("EMAIL_FROM") ?? null,
    testAllowlist,
    defaultTestRecipient: testAllowlist[0] ?? null,
    founderEmails,
    problems,
  };
}

/** Values safe to show in the browser. */
export function publicConfig() {
  const c = getConfig();
  return {
    data: c.data,
    ai: c.ai,
    email: c.email,
    geminiModel: c.ai === "gemini" ? c.geminiModel : null,
    testAllowlist: c.testAllowlist,
    problems: c.problems,
  };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
