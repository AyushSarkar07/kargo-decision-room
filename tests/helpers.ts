import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "@/lib/store/local";
import { setStoreForTests } from "@/lib/store";
import { setProviderForTests } from "@/lib/pipeline";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { outboundLog } from "@/lib/ai/provider";
import type { AppConfig } from "@/lib/config";

export const FIXTURES = path.resolve(__dirname, "..", "fixtures", "synthetic");
export const fixture = (f: string) => readFileSync(path.join(FIXTURES, f));

export function freshStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "kargo-test-"));
  const store = new LocalStore(dir);
  setStoreForTests(store);
  setProviderForTests(new SimulatedProvider());
  outboundLog.length = 0;
  return { store, dir };
}

export const testConfig = (over: Partial<AppConfig> = {}): AppConfig => ({
  data: "local-demo",
  ai: "simulated",
  email: "resend-test",
  geminiModel: "test-model",
  emailFrom: "Kargo <hiring@example.org>",
  testAllowlist: ["inbox@example.org", "kavya.menon@example.com"],
  defaultTestRecipient: "inbox@example.org",
  founderEmails: ["arjun@example.org"],
  problems: [],
  ...over,
});
