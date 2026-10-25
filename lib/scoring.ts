// Outlier scoring (SPEC.md §5). Pure functions so they are easy to test.

export type OutlierLabel = "breakout" | "strong" | "normal";

export const BREAKOUT_AT = 5;
export const STRONG_AT = 2;
/** Noise filter defaults: tiny accounts and low-view videos produce meaningless ratios. */
export const MIN_VIEWS = 1000;
export const MIN_FOLLOWERS = 100;

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** views ÷ followers. */
export function reachScore(views: number | null, followers: number | null): number | null {
  if (views === null || followers === null) return null;
  return views / Math.max(followers, 1);
}

/** views ÷ the account's usual (median) views. */
export function usualScore(views: number | null, usualViews: number | null): number | null {
  if (views === null || !usualViews) return null;
  return views / usualViews;
}

/**
 * Usual views for a creator: median of recent posts, leaving out the post being scored
 * so a single viral video doesn't inflate its own baseline.
 */
export function usualViewsExcluding(recent: { id: string; views: number | null }[], excludeId?: string) {
  return median(recent.filter((p) => p.id !== excludeId && p.views !== null).map((p) => p.views as number));
}

/** Label from the usual-views score; falls back to the reach score when no baseline exists. */
export function labelFor(usual: number | null, reach: number | null): OutlierLabel {
  const x = usual ?? reach;
  if (x === null) return "normal";
  if (x >= BREAKOUT_AT) return "breakout";
  if (x >= STRONG_AT) return "strong";
  return "normal";
}

export function passesNoiseFilter(
  views: number | null,
  followers: number | null,
  opts = { minViews: MIN_VIEWS, minFollowers: MIN_FOLLOWERS },
) {
  if (views === null || views < opts.minViews) return false;
  if (followers !== null && followers < opts.minFollowers) return false;
  return true;
}

/** 83.04 → "83", 6.53 → "6.5" */
export function formatMultiplier(x: number): string {
  return x >= 10 ? Math.round(x).toString() : (Math.round(x * 10) / 10).toString();
}
