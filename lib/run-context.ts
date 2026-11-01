import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Paid calls made while one research runs, by platform (ScrapeCreators: 1 credit each). Saved as stats.credits. */
export type RunCredits = { total: number; tiktok: number; instagram: number; other: number };

const store = new AsyncLocalStorage<RunCredits>();

/** Runs `fn` with a fresh credit counter and returns both. Calls made outside a research are not counted here. */
export async function countCredits<T>(fn: () => Promise<T>): Promise<{ value: T; credits: RunCredits }> {
  const credits: RunCredits = { total: 0, tiktok: 0, instagram: 0, other: 0 };
  const value = await store.run(credits, fn);
  return { value, credits };
}

/** Called for each logged ScrapeCreators call (lib/usage.ts). */
export function addCredit(endpoint: string, calls = 1) {
  const c = store.getStore();
  if (!c) return;
  c.total += calls;
  if (endpoint.includes("/tiktok/")) c.tiktok += calls;
  else if (endpoint.includes("/instagram/")) c.instagram += calls;
  else c.other += calls;
}
