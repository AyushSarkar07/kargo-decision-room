import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { assertNoPII } from "../pii";
import { SCORING_SYSTEM, SYNTHESIS_SYSTEM, scoringInput, synthesisInput } from "./prompts";
import { ScoringOut, SynthesisOut, scoringJsonSchema, synthesisJsonSchema } from "./schemas";
import { outboundLog, type AIProvider, type PIIGuard } from "./provider";

export class GeminiProvider implements AIProvider {
  live = true;
  private ai: GoogleGenAI;
  constructor(apiKey: string, public id: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async call<T>(system: string, input: string, schema: object, zod: ZodType<T>, guard: PIIGuard): Promise<T> {
    // Last line of defence: refuse to send anything identifying.
    assertNoPII(input, guard, guard.aliases);
    if (process.env.NODE_ENV === "test") outboundLog.push({ system, input });
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const interaction = await this.ai.interactions.create({
        model: this.id,
        system_instruction: system,
        input: attempt === 0 ? input : `${input}\n\nYour previous reply failed validation (${lastError}). Reply again with JSON that matches the schema exactly.`,
        response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> },
        generation_config: { thinking_level: "low" },
        store: false,
      });
      const text = interaction.output_text ?? "";
      try {
        return zod.parse(JSON.parse(text));
      } catch (e) {
        lastError = (e as Error).message.slice(0, 300);
      }
    }
    throw new Error(`Gemini returned invalid structured output twice: ${lastError}`);
  }

  score(lines: Parameters<AIProvider["score"]>[0], appliedRole: Parameters<AIProvider["score"]>[1], guard: PIIGuard) {
    return this.call(SCORING_SYSTEM, scoringInput(lines, appliedRole), scoringJsonSchema, ScoringOut, guard);
  }

  synthesize(args: Parameters<typeof synthesisInput>[0], guard: PIIGuard) {
    return this.call(SYNTHESIS_SYSTEM, synthesisInput(args), synthesisJsonSchema, SynthesisOut, guard);
  }
}
