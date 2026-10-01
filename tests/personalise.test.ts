import { describe, expect, it } from "vitest";
import { insertDetail, isPersonalised, mentionsDetail, pickDetails } from "@/lib/ai/personalise";
import { ingestFile, scoreApplicant, setProviderForTests } from "@/lib/pipeline";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { getStore } from "@/lib/store";
import { fixture, freshStore } from "./helpers";

const detail = "Built a shared spreadsheet tracker for onboarding blockers; adopted by all 6 implementation managers within a month";

describe("specificity checks", () => {
  it("accepts an email that echoes the detail's numbers or distinctive words", () => {
    expect(mentionsDetail("Your onboarding blockers tracker, adopted by all 6 implementation managers, stood out.", detail)).toBe(true);
    expect(mentionsDetail("Your spreadsheet tracker for onboarding blockers stood out.", detail)).toBe(true);
  });
  it("rejects generic praise", () => {
    expect(mentionsDetail("Your extensive background and impressive experience caught my attention.", detail)).toBe(false);
  });
  it("requires the named detail id to exist", () => {
    const d = [{ id: "D1", text: detail }];
    expect(isPersonalised("tracker for onboarding blockers", "D1", d)).toBe(true);
    expect(isPersonalised("tracker for onboarding blockers", "D9", d)).toBe(false);
    expect(isPersonalised("anything", "none", [])).toBe(true);
  });
  it("inserts the CV line right after the greeting", () => {
    const out = insertDetail("Hi {{first_name}},\n\nThank you for applying.\n\nArjun", { id: "D1", text: detail }, "invite");
    expect(out.startsWith("Hi {{first_name}},\n\nOne line in your application stood out to me:")).toBe(true);
    expect(out).toContain("Thank you for applying.");
  });
  it("picks strongest distinct details first", () => {
    const d = pickDetails([
      { criterion_id: "a", score: 2, evidence: [{ line_id: "L1", excerpt: "Wrote SQL reports for the category team every week" }], reason: "", uncertainty: "low" },
      { criterion_id: "b", score: 4, evidence: [{ line_id: "L2", excerpt: detail }], reason: "", uncertainty: "low" },
      { criterion_id: "c", score: null, evidence: [], reason: "", uncertainty: "high" },
    ]);
    expect(d.map((x) => x.text)).toEqual([detail, "Wrote SQL reports for the category team every week"]);
  });
});

describe("drafts that stay generic", () => {
  it("retry once, then quote the person's own CV line", async () => {
    freshStore();
    class Generic extends SimulatedProvider {
      calls = 0;
      async synthesize(...args: Parameters<SimulatedProvider["synthesize"]>) {
        this.calls++;
        const out = await super.synthesize(...args);
        const generic = "Hi {{first_name}},\n\nThank you for applying. Your extensive background caught my attention.\n\nArjun Mehta, Founder, Kargo";
        return { ...out, invite: { ...out.invite, body: generic, personal_detail_id: "D1" }, rejection: { ...out.rejection, body: generic, personal_detail_id: "D1" } };
      }
    }
    const p = new Generic();
    setProviderForTests(p);
    const a = await ingestFile({ data: fixture("s01_strong_pm.txt"), filename: "s01.txt", role: "PM" });
    await scoreApplicant(a.id);
    expect(p.calls).toBe(2); // first try + one retry with feedback
    const drafts = (await getStore().listDrafts()).filter((d) => d.applicant_id === a.id);
    for (const d of drafts) {
      expect(d.generated_by).toMatch(/\+cv-detail$/);
      expect(d.body).toMatch(/"[^"]{20,}"/);
      expect(d.body.startsWith("Hi {{first_name}},")).toBe(true);
    }
  });
});
