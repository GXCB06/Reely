import "server-only";
import { google } from "@ai-sdk/google";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";

// Measured 2026-10-26 on the free tier, plan-sized answer: gemini-3-flash-preview starts in ~1 s and finishes in
// ~2 s; gemini-flash-lite-latest (now 3.5 Flash-Lite) waited 15-26 s before its first token.
const FAST_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

/** The model calls go to (GEMINI_MODEL overrides it); also stored with cached AI output. */
export const modelName = () => process.env.GEMINI_MODEL || FAST_MODEL;

/** When the main model returns an API error (quota, model retired, overloaded), the same call goes to `modelId`. */
function fallbackTo(modelId: string): LanguageModelMiddleware {
  const fallback = google(modelId);
  const warn = (e: unknown) => console.warn(`[ai] ${modelName()} failed, trying ${modelId}:`, (e as Error).message);
  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (e) {
        if (params.abortSignal?.aborted) throw e;
        warn(e);
        return fallback.doGenerate(params);
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (e) {
        if (params.abortSignal?.aborted) throw e;
        warn(e);
        return fallback.doStream(params);
      }
    },
  };
}

/** Gemini model, or null when no key is set (callers then return sample output). */
export function getModel() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const main = modelName();
  return main === FALLBACK_MODEL ? google(main) : wrapLanguageModel({ model: google(main), middleware: fallbackTo(FALLBACK_MODEL) });
}

export const languageName = (locale: string) => (locale === "en" ? "English" : "Thai");

/** Shared options for every Gemini call: short tasks, so cap time and thinking and retry once. */
export function aiCallOptions(timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 25_000) {
  return {
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(timeoutMs),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" as const } } },
  };
}
