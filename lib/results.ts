// Pure helpers for research results: exclusions, URL filters and sorting. No server imports (tested directly).
import { hashtagsOf } from "./run-stats";
import { bestScore, engagementFactor, type OutlierLabel } from "./scoring";

export type Sort = "best" | "outlier" | "engagement" | "views" | "saves" | "recent";
export type PlatformTab = "all" | "tiktok" | "youtube" | "instagram";

export type ResultFilters = {
  platform: PlatformTab;
  minViews: number | null;
  minOutlier: number | null;
  minSaves: number | null;
  postedDays: number | null;
  /** A hashtag (without #) the caption must contain; set by the "most used hashtags" chips. */
  tag: string | null;
  sort: Sort;
};

export const FILTER_PRESETS = {
  minViews: [10_000, 50_000, 100_000, 500_000, 1_000_000],
  minOutlier: [2, 5, 10],
  minSaves: [100, 1_000, 10_000],
  postedDays: [7, 30, 90, 180],
} as const;

const SORTS: Sort[] = ["best", "outlier", "engagement", "views", "saves", "recent"];
const TABS: PlatformTab[] = ["all", "tiktok", "youtube", "instagram"];

/** True when the caption mentions any excluded word (case-insensitive substring; Thai has no spaces). */
export function isExcluded(caption: string, exclusions: string[]) {
  const text = caption.toLowerCase();
  return exclusions.some((w) => w.trim() && text.includes(w.trim().toLowerCase()));
}

/** With at least this many clearly on-topic results, drop the "same field" ones (score 1). */
export const STRICT_RELEVANCE_AT = 15;

/** Which results survive the AI relevance check: score 2 always; score 1 only while clear matches are few. */
export function relevanceKeep(scores: number[], strictAt = STRICT_RELEVANCE_AT): boolean[] {
  const minScore = scores.filter((s) => s === 2).length >= strictAt ? 2 : 1;
  return scores.map((s) => s >= minScore);
}

/** Above every label tier ("best" scores are tiered in steps of 1e12): exact matches before broader clips. */
export const EXACT_TIER = 1e14;

/**
 * A result the relevance check scored "inside the field, not the product" (1, or 0 when it was kept anyway). Not
 * scored (older researches, or the check failed) counts as exact, so nothing is demoted for lack of a score.
 */
export const isBroader = (r: { relevance?: number | null }) => r.relevance === 1 || r.relevance === 0;

/** Exact matches first, each group in the given order (search quality S1: measured on the owner's 391 labels). */
export function withExactFirst<T extends { relevance?: number | null }>(score: (v: T) => number): (v: T) => number {
  return (v) => (isBroader(v) ? 0 : EXACT_TIER) + score(v);
}

/** Broader clips shown under the best 10 ("Same audience, broader topic"). */
export const BROADER_SHOWN = 6;

/**
 * The results page's default view: the best 10 from exact matches only (fewer when there are fewer, never padded with
 * broader clips), and up to BROADER_SHOWN broader clips for their own section.
 */
export function topSplit<T extends FilterableResult>(rows: T[], score: (r: T) => number, n = 10) {
  return {
    top: diverseTop(rows.filter((r) => !isBroader(r)), n, 2, score),
    broader: diverseTop(rows.filter(isBroader), BROADER_SHOWN, 1, score),
  };
}

/** How much a result's account fitting the product (creator fit 0-2) weighs in the "best" order. */
// Measured on the test set (2026-11-01): 0.85 / 0.6 bunched the top results on a few broad "fit 2" accounts
// (concentration 27% → 38%), so the nudge is gentler.
export const CREATOR_FIT_FACTOR: Record<number, number> = { 2: 1, 1: 0.92, 0: 0.75 };

/**
 * Nudges a "best" score by how well the clip's ACCOUNT fits the product, inside its label tier (scores are tiered in
 * steps of 1e12, as in withFeedback): an off-topic account's breakout stays a breakout but sinks among breakouts.
 * Unknown fit (null) leaves the score as it is.
 */
export function withCreatorFit<T>(score: (v: T) => number, fitOf: (v: T) => number | null | undefined): (v: T) => number {
  return (v) => {
    const s = score(v);
    const fit = fitOf(v);
    if (fit === null || fit === undefined) return s;
    const tier = Math.floor(s / 1e12) * 1e12;
    return tier + (s - tier) * (CREATOR_FIT_FACTOR[fit] ?? 1);
  };
}

/** A clip goes when its account is unrelated (fit 0) unless the clip itself is clearly on topic (relevance 2). */
export function dropForCreator(creatorFit: number | null | undefined, clipRelevance: number | null | undefined): boolean {
  return creatorFit === 0 && (clipRelevance ?? 0) < 2;
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

/**
 * True for the product's own account (e.g. @accospro.app for "AccOS Pro"): its clips are not ideas to borrow.
 * Names under 5 letters are skipped, so a short word doesn't hide other creators.
 */
export function isOwnAccount(handle: string, productName: string | undefined) {
  const name = squash(productName ?? "");
  return name.length >= 5 && squash(handle).includes(name);
}

/** True when the account is one of these brands (e.g. @myfitnesspal for "MyFitnessPal"): a similar product's own channel. */
export function isBrandAccount(handle: string, brands: string[] | undefined) {
  return (brands ?? []).some((b) => isOwnAccount(handle, b));
}

function presetOrNull(raw: string | string[] | undefined, allowed: readonly number[]) {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return allowed.includes(n) ? n : null;
}

/** Reads filters from URL search params, ignoring anything that isn't a known preset. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): ResultFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  return {
    platform: TABS.includes(one("platform") as PlatformTab) ? (one("platform") as PlatformTab) : "all",
    minViews: presetOrNull(sp.minViews, FILTER_PRESETS.minViews),
    minOutlier: presetOrNull(sp.minOutlier, FILTER_PRESETS.minOutlier),
    minSaves: presetOrNull(sp.minSaves, FILTER_PRESETS.minSaves),
    postedDays: presetOrNull(sp.posted, FILTER_PRESETS.postedDays),
    tag: one("tag")?.replace(/^#/, "").trim().toLowerCase().slice(0, 60) || null,
    sort: SORTS.includes(one("sort") as Sort) ? (one("sort") as Sort) : "best",
  };
}

export type FilterableResult = {
  platform: string;
  /** The relevance check's score for the clip (2 exact, 1 broader); null when it never ran. */
  relevance?: number | null;
  views: number | null;
  likes?: number | null;
  comments?: number | null;
  saves: number | null;
  shares: number | null;
  label: OutlierLabel;
  publishedAt: string | null;
  usual: number | null;
  reach: number | null;
  caption?: string;
  creatorHandle?: string;
};

export const outlierOf = (r: Pick<FilterableResult, "usual" | "reach">) => r.usual ?? r.reach ?? 0;

/** `score`: what "best" means (the goal-aware score on a research with a goal). */
export function applyFilters<T extends FilterableResult>(
  rows: T[],
  f: ResultFilters,
  now = Date.now(),
  score: (r: T) => number = bestScore,
): T[] {
  const filtered = rows.filter((r) => {
    if (f.platform !== "all" && r.platform !== f.platform) return false;
    if (f.minViews !== null && (r.views ?? 0) < f.minViews) return false;
    if (f.minOutlier !== null && outlierOf(r) < f.minOutlier) return false;
    if (f.minSaves !== null && (r.saves ?? 0) < f.minSaves) return false;
    if (f.tag !== null && !hashtagsOf(r.caption).includes(f.tag)) return false;
    if (f.postedDays !== null) {
      if (!r.publishedAt) return false;
      if (now - new Date(r.publishedAt).getTime() > f.postedDays * 864e5) return false;
    }
    return true;
  });
  const key: Record<Sort, (r: T) => number> = {
    best: score,
    outlier: outlierOf,
    // Engagement versus the platform's typical clip; views break ties.
    engagement: (r) => engagementFactor(r) * 1e12 + (r.views ?? 0),
    views: (r) => r.views ?? 0,
    saves: (r) => r.saves ?? 0,
    recent: (r) => (r.publishedAt ? new Date(r.publishedAt).getTime() : 0),
  };
  return filtered.sort((a, b) => key[f.sort](b) - key[f.sort](a));
}

/**
 * The n best results, but with up to `minPer` from each platform that has any (a list sorted only by score is all
 * TikTok, which hides good Shorts and Reels) and at most `maxPerCreator` from one creator (so the 10 are 10 ideas,
 * not one account's feed). Falls back to the plain order when there aren't enough creators.
 */
export function diverseTop<T extends FilterableResult>(
  rows: T[],
  n = 10,
  minPer = 2,
  score: (r: T) => number = bestScore,
  maxPerCreator = 2,
): T[] {
  const sorted = [...rows].sort((a, b) => score(b) - score(a));
  const perCreator = new Map<string, number>();
  const creatorOk = (r: T) => !r.creatorHandle || (perCreator.get(`${r.platform}:${r.creatorHandle}`) ?? 0) < maxPerCreator;
  const picked = new Set<T>();
  const pick = (r: T) => {
    picked.add(r);
    if (r.creatorHandle) perCreator.set(`${r.platform}:${r.creatorHandle}`, (perCreator.get(`${r.platform}:${r.creatorHandle}`) ?? 0) + 1);
  };
  for (const p of new Set(sorted.map((r) => r.platform))) {
    sorted.filter((r) => r.platform === p && creatorOk(r)).slice(0, minPer).forEach((r) => picked.size < n && creatorOk(r) && pick(r));
  }
  for (const r of sorted) if (picked.size < n && !picked.has(r) && creatorOk(r)) pick(r);
  for (const r of sorted) if (picked.size < n && !picked.has(r)) pick(r);
  return sorted.filter((r) => picked.has(r));
}
