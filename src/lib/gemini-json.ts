import type { GoogleGenAI } from "@google/genai";

const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];

export class InterpretationUnavailableError extends Error {
  constructor() {
    super("We couldn't finish comparing places right now. Please try again in a moment.");
    this.name = "InterpretationUnavailableError";
  }
}

class InvalidInterpretationError extends Error {}

// One generator per search remembers which models are unavailable. Validation is
// part of the attempt: a successful HTTP call can still contain unusable output.
export function createJsonGenerator(ai: GoogleGenAI, signal: AbortSignal) {
  const unavailable = new Set<string>();
  let preferred = MODELS[0];

  return async function generateJson<T>(contents: string, schema: unknown, validate: (data: any) => T): Promise<T> {
    const models = [preferred, ...MODELS.filter(model => model !== preferred)];
    for (const model of models) {
      if (unavailable.has(model)) continue;
      for (let attempt = 1; attempt <= 2; attempt++) {
        signal.throwIfAborted();
        try {
          console.log(`Gemini: trying ${model}, attempt ${attempt}`);
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              abortSignal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
              responseMimeType: "application/json",
              responseJsonSchema: schema,
              maxOutputTokens: 16_384,
            },
          });
          let result: T;
          try {
            if (response.candidates?.some(candidate => candidate.finishReason === "MAX_TOKENS")) {
              throw new Error("Gemini response was truncated.");
            }
            const text = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            result = validate(JSON.parse(text));
          } catch (error) {
            // Log only validation metadata, never provider payloads or API keys.
            const reason = error instanceof SyntaxError ? "invalid JSON" : "incomplete interpretation";
            console.warn(`Gemini: ${model} returned ${reason}; retrying (${response.candidates?.[0]?.finishReason ?? "unknown finish reason"}).`);
            throw new InvalidInterpretationError(reason);
          }
          preferred = model;
          console.log(`Gemini: ${model} succeeded with validated JSON`);
          return result;
        } catch (error: any) {
          signal.throwIfAborted();
          const status = Number(error?.status ?? error?.code ?? error?.error?.code);
          if (status === 429 || status === 404) {
            console.warn(`Gemini: ${model} unavailable (${status}); using another model for this search.`);
            unavailable.add(model);
            break;
          }
          const retryable = error instanceof InvalidInterpretationError || status === 503 || status === 500 || status === 502 || status === 504 || error?.name === "TimeoutError";
          if (!retryable) throw error;
          if (attempt === 2) unavailable.add(model);
        }
      }
    }
    throw new InterpretationUnavailableError();
  };
}
