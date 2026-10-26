import "server-only";
import { google } from "@ai-sdk/google";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";

// Measured 2026-10-26/27 on the free tier: gemini-3-flash-preview answers a plan in ~2 s and a script in ~4 s, but
// now and then hangs for 60 s+; gemini-3.1-flash-lite answers a script in ~4 s; gemini-flash-lite-latest (3.5
// Flash-Lite) waited 15-26 s before its first token.
const FAST_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
/** How long the main model gets to answer (to start answering, for streams) before the call moves to the fallback. */
const MAIN_MODEL_BUDGET_MS = 15_000;

/** The model calls go to (GEMINI_MODEL overrides it); also stored with cached AI output. */
export const modelName = () => process.env.GEMINI_MODEL || FAST_MODEL;

/**
 * Sends the call to `modelId` when the main model returns an API error (quota, model retired, overloaded) or
 * has not answered within MAIN_MODEL_BUDGET_MS. The caller's own timeout still covers both attempts.
 */
function fallbackTo(modelId: string): LanguageModelMiddleware {
  const fallback = google(modelId);
  const warn = (e: unknown) => console.warn(`[ai] ${modelName()} failed, trying ${modelId}:`, (e as Error).message);
  // An abort signal that fires at the caller's timeout or after the main model's budget, whichever comes first.
  const budget = (signal: AbortSignal | undefined) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`no answer in ${MAIN_MODEL_BUDGET_MS / 1000} s`)), MAIN_MODEL_BUDGET_MS);
    return { signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, stop: () => clearTimeout(timer) };
  };
  return {
    wrapGenerate: async ({ model, params }) => {
      const b = budget(params.abortSignal);
      try {
        return await model.doGenerate({ ...params, abortSignal: b.signal });
      } catch (e) {
        if (params.abortSignal?.aborted) throw e;
        warn(e);
        return fallback.doGenerate(params);
      } finally {
        b.stop();
      }
    },
    wrapStream: async ({ model, params }) => {
      const b = budget(params.abortSignal);
      try {
        // Once the stream has started, only the caller's timeout applies (the budget timer is cleared).
        return await model.doStream({ ...params, abortSignal: b.signal });
      } catch (e) {
        if (params.abortSignal?.aborted) throw e;
        warn(e);
        return fallback.doStream(params);
      } finally {
        b.stop();
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
