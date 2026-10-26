import "server-only";
import { google } from "@ai-sdk/google";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";

// Measured 2026-10-26/27 on the free tier: gemini-3.1-flash-lite answers a plan in ~3-10 s and a script in ~4 s,
// but at busy times answers "high demand"; gemini-3-flash-preview is fastest (~2 s) but its free tier allows only
// 20 requests a day, so it is the emergency lane; gemini-flash-lite-latest (3.5 Flash-Lite) works but waited
// 15-26 s before its first token, so it is the last resort.
const MAIN_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-flash-lite-latest"];
/** How long each model except the last gets to answer (to start answering, for streams) before the next one. */
const ATTEMPT_BUDGET_MS = 15_000;

/** The model calls go to first (GEMINI_MODEL overrides it); also stored with cached AI output. */
export const modelName = () => process.env.GEMINI_MODEL || MAIN_MODEL;

/**
 * Moves the call down the fallback list when a model returns an API error (busy, quota, retired) or has not
 * answered within ATTEMPT_BUDGET_MS. The last model gets whatever time the caller's own timeout leaves.
 */
function fallbackTo(modelIds: string[]): LanguageModelMiddleware {
  const chain = modelIds.map((id) => ({ id, model: google(id) }));
  // An abort signal that fires at the caller's timeout or after this attempt's budget, whichever comes first.
  const budget = (signal: AbortSignal | undefined) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`no answer in ${ATTEMPT_BUDGET_MS / 1000} s`)), ATTEMPT_BUDGET_MS);
    return { signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, stop: () => clearTimeout(timer) };
  };
  async function attempt<T>(
    first: (signal: AbortSignal) => PromiseLike<T>,
    next: (i: number, signal: AbortSignal | undefined) => PromiseLike<T>,
    callerSignal: AbortSignal | undefined,
  ): Promise<T> {
    let from = modelName();
    for (let i = -1; i < chain.length; i++) {
      const last = i === chain.length - 1;
      const b = last ? null : budget(callerSignal);
      try {
        // Once a stream has started, only the caller's timeout applies (the budget timer is cleared).
        return await (i < 0 ? first(b!.signal) : next(i, b?.signal ?? callerSignal));
      } catch (e) {
        if (callerSignal?.aborted || last) throw e;
        console.warn(`[ai] ${from} failed, trying ${chain[i + 1].id}:`, (e as Error).message.slice(0, 160));
        from = chain[i + 1].id;
      } finally {
        b?.stop();
      }
    }
    throw new Error("unreachable");
  }
  return {
    wrapGenerate: ({ model, params }) =>
      attempt(
        (signal) => model.doGenerate({ ...params, abortSignal: signal }),
        (i, signal) => chain[i].model.doGenerate({ ...params, abortSignal: signal }),
        params.abortSignal,
      ),
    wrapStream: ({ model, params }) =>
      attempt(
        (signal) => model.doStream({ ...params, abortSignal: signal }),
        (i, signal) => chain[i].model.doStream({ ...params, abortSignal: signal }),
        params.abortSignal,
      ),
  };
}

/** Gemini model, or null when no key is set (callers then return sample output). */
export function getModel() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const main = modelName();
  const fallbacks = FALLBACK_MODELS.filter((id) => id !== main);
  return wrapLanguageModel({ model: google(main), middleware: fallbackTo(fallbacks) });
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
