import "server-only";
import { google } from "@ai-sdk/google";

/** Gemini model, or null when no key is set (callers then return sample output). */
export function getModel() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  return google(process.env.GEMINI_MODEL || "gemini-flash-lite-latest");
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
