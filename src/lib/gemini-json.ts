import type { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];

export class InterpretationUnavailableError extends Error {
  constructor() {
    super("We couldn't finish comparing places right now. Please try again in a moment.");
    this.name = "InterpretationUnavailableError";
  }
}

class InvalidInterpretationError extends Error {}
const responseCache=new Map<string,{expires:number;response:GenerateContentResponse}>();
export function createJsonGenerator(ai: GoogleGenAI, signal: AbortSignal, cacheScope?: string) {
  const unavailable = new Set<string>();
  let preferred = "gemini-2.5-flash";
  let researchDeadline=0;

  return async function generateJson<T>(contents: string, schema: unknown, validate: (data: any, response: GenerateContentResponse) => T, options: { googleSearch?: boolean; urlContext?: boolean; metadataFallback?: () => T } = {}): Promise<T> {
    const mode=options.googleSearch?(options.urlContext?'search-urls':'search'):'plain';
    const cacheKey=JSON.stringify([contents,schema,mode,cacheScope]);
    const cached=cacheScope?responseCache.get(cacheKey):undefined;
    if(cached&&cached.expires>Date.now()){
      signal.throwIfAborted();
      try{return validate(JSON.parse((cached.response.text??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')),cached.response);}catch{responseCache.delete(cacheKey);}
    }
    if(options.googleSearch&&!researchDeadline)researchDeadline=Date.now()+90_000;
    const supportedModels = ["gemini-2.5-flash", ...MODELS];
    const first = options.googleSearch ? supportedModels[0] : supportedModels.includes(preferred) ? preferred : supportedModels[0];
    const models = [first, ...supportedModels.filter(model => model !== first)];
    for (const model of models) {
      if (unavailable.has(`${model}:${mode}`)) continue;
      for (let attempt = 1; attempt <= 2; attempt++) {
        signal.throwIfAborted();
        const remaining=options.googleSearch?researchDeadline-Date.now():60_000;
        if(remaining<=0){if(options.metadataFallback)return options.metadataFallback();throw new InterpretationUnavailableError();}
        const attemptTimeout=AbortSignal.timeout(Math.min(options.googleSearch?30_000:60_000,remaining));
        try {
          console.log(`Gemini: trying ${model}, attempt ${attempt}`);
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              abortSignal: AbortSignal.any([signal, attemptTimeout]),
              ...(!(options.googleSearch && model === "gemini-2.5-flash") ? {responseMimeType: "application/json",responseJsonSchema: schema} : {}),
              maxOutputTokens: 16_384,
              ...(model === "gemini-2.5-flash" ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              ...(options.googleSearch ? { tools: [{ googleSearch: {} }, ...(options.urlContext ? [{ urlContext: {} }] : [])] } : {}),
            },
          });
          let result: T;
          try {
            if (response.candidates?.some(candidate => candidate.finishReason === "MAX_TOKENS")) {
              throw new Error("Gemini response was truncated.");
            }
            const text = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            result = validate(JSON.parse(text), response);
          } catch (error) {
            const reason = error instanceof SyntaxError ? "invalid JSON" : "incomplete interpretation";
            console.warn(`Gemini: ${model} returned ${reason}; retrying (${response.candidates?.[0]?.finishReason ?? "unknown finish reason"}).`);
            throw new InvalidInterpretationError(reason);
          }
          if(cacheScope){
          if(responseCache.size>=40)responseCache.delete(responseCache.keys().next().value!);
          responseCache.set(cacheKey,{expires:Date.now()+(options.googleSearch?30:5)*60_000,response});
          }
          preferred = model;
          console.log(`Gemini: ${model} succeeded with validated JSON`);
          return result;
        } catch (error: any) {
          signal.throwIfAborted();
          const status = Number(error?.status ?? error?.code ?? error?.error?.code);
          const timedOut = attemptTimeout.aborted || error?.name === "TimeoutError" || error?.code === "ETIMEDOUT" || error?.cause?.code === "ETIMEDOUT";
          if (status === 429 || status === 404 || timedOut) {
            console.warn(`Gemini: ${model} unavailable (${status}); using another model for this search.`);
            unavailable.add(`${model}:${mode}`);
            break;
          }
          const retryable = error instanceof InvalidInterpretationError || status === 503 || status === 500 || status === 502 || status === 504 || error?.name === "TimeoutError";
          if (!retryable) throw error;
          if (attempt === 2) unavailable.add(`${model}:${mode}`);
        }
      }
    }
    if (options.googleSearch && options.metadataFallback) return options.metadataFallback();
    throw new InterpretationUnavailableError();
  };
}
