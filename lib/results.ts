// Pure helpers for research results: exclusions, URL filters and sorting. No server imports (tested directly).
import { hashtagsOf } from "./run-stats";
import { bestScore, type OutlierLabel } from "./scoring";

export type Sort = "best" | "outlier" | "views" | "saves" | "recent";
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

const SORTS: Sort[] = ["best", "outlier", "views", "saves", "recent"];
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

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * True for the product's own account (e.g. @accospro.app for "AccOS Pro"): its clips are not ideas to borrow.
 * Names under 5 letters are skipped, so a short word doesn't hide other creators.
 */
export function isOwnAccount(handle: string, productName: string | undefined) {
  const name = squash(productName ?? "");
  return name.length >= 5 && squash(handle).includes(name);
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
  views: number | null;
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
