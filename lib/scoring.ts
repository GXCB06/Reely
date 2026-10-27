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
  const m = median(recent.filter((p) => p.id !== excludeId && p.views !== null).map((p) => p.views as number));
  // Views are whole numbers; an even-sized median can land on .5.
  return m === null ? null : Math.round(m);
}

/** A multiplier alone isn't viral: 1,800 views at 36x usual is still a small video. */
export const BREAKOUT_MIN_VIEWS = 10_000;
export const STRONG_MIN_VIEWS = 5_000;
/** Views ÷ followers only counts on accounts this big (a 100-subscriber channel makes ratios meaningless). */
export const REACH_MIN_FOLLOWERS = 1_000;

/**
 * Label from the usual-views score; falls back to the reach score when no baseline exists.
 * With `size`, a label also needs real views (10K+ for breakout, 5K+ for strong), and the reach
 * fallback only counts for accounts with 1K+ followers.
 */
export function labelFor(
  usual: number | null,
  reach: number | null,
  size?: { views: number | null; followers: number | null },
): OutlierLabel {
  const reachCounts = !size || size.followers === null || size.followers >= REACH_MIN_FOLLOWERS;
  const x = usual ?? (reachCounts ? reach : null);
  if (x === null) return "normal";
  const views = size ? (size.views ?? 0) : Infinity;
  if (x >= BREAKOUT_AT && views >= BREAKOUT_MIN_VIEWS) return "breakout";
  if (x >= STRONG_AT && views >= STRONG_MIN_VIEWS) return "strong";
  return "normal";
}

/** Saves + shares per view (TikTok only): people keeping or passing a video on = useful, copy-worthy. */
export function keepRate(v: { views: number | null; saves: number | null; shares: number | null }): number | null {
  if (!v.views || (v.saves === null && v.shares === null)) return null;
  return ((v.saves ?? 0) + (v.shares ?? 0)) / v.views;
}

const LABEL_RANK: Record<OutlierLabel, number> = { breakout: 2, strong: 1, normal: 0 };

type Engageable = {
  platform?: string;
  views: number | null;
  likes?: number | null;
  comments?: number | null;
  saves: number | null;
  shares: number | null;
};

/** Likes + comments + saves + shares per view, as shown on cards. Null when the platform gave none of them. */
export function engagementRate(v: Engageable): number | null {
  const parts = [v.likes, v.comments, v.saves, v.shares];
  if (!v.views || parts.every((p) => p === null || p === undefined)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0) / v.views;
}

/**
 * Weighted engagement (likes + 3x comments + 5x saves and shares, per view) on a typical clip of each platform:
 * TikTok shows all four; YouTube and Instagram feeds only likes and comments.
 */
const TYPICAL_ENGAGEMENT: Record<string, number> = { tiktok: 0.1, youtube: 0.035, instagram: 0.04 };

/**
 * How engaged viewers were versus a typical clip on the same platform (0.4-3x; 1 when unknown). A 1M-view clip
 * nobody likes or saves ranks below a 400K-view clip people comment on, save and share.
 */
export function engagementFactor(v: Engageable): number {
  if (!v.views || engagementRate(v) === null) return 1;
  const weighted = ((v.likes ?? 0) + 3 * (v.comments ?? 0) + 5 * ((v.saves ?? 0) + (v.shares ?? 0))) / v.views;
  const typical = TYPICAL_ENGAGEMENT[v.platform ?? "tiktok"] ?? TYPICAL_ENGAGEMENT.tiktok;
  return Math.min(3, Math.max(0.4, weighted / typical));
}

/**
 * "Best" order: label first, then views weighted by engagement (engagementFactor).
 * Raw multipliers are not used here, so tiny accounts with huge ratios don't float to the top.
 */
export function bestScore(v: Engageable & { label: OutlierLabel }): number {
  return LABEL_RANK[v.label] * 1e12 + (v.views ?? 0) * engagementFactor(v);
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

/** 83.04 → "83", 6.53 → "6.5", 0.004 → "<0.1" */
export function formatMultiplier(x: number): string {
  // Tiny ratios (e.g. views ÷ a huge follower count) would round to a misleading "0".
  if (x > 0 && x < 0.1) return "<0.1";
  return x >= 10 ? Math.round(x).toString() : (Math.round(x * 10) / 10).toString();
}
