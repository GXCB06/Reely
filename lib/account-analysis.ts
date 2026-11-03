// My channels (v0.3 Part B): what a founder's own public posts say, measured against the account's own normal.
// Pure, so every number on the page is unit-tested. Written for any account, so the v0.2 Channel page can reuse it.
import { median, STRONG_AT, usualViewsExcluding } from "@/lib/scoring";

export type ChannelPost = { id: string; views: number | null; publishedAt: string | null };

/** A hit is a post at 2x the account's usual views or more (relative only: founders' accounts are small). */
export const HIT_AT = STRONG_AT;
/** Fewer dated posts than this and posting-time patterns are noise, so the page doesn't show them. */
export const PATTERN_MIN_POSTS = 20;
/** The hit rate needs a few posts to mean anything. */
const HIT_RATE_MIN_POSTS = 5;

/** Each post's views ÷ the account's usual views without it (so one viral post doesn't lift its own baseline). */
export function multipliers(posts: ChannelPost[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of posts) {
    const usual = usualViewsExcluding(posts, p.id);
    if (p.views !== null && usual) out.set(p.id, p.views / usual);
  }
  return out;
}

export type Snapshot = {
  /** Median views of the posts read. */
  usual: number | null;
  /** Share of posts at HIT_AT or more; null under 5 posts with views. */
  hitRate: number | null;
  hits: number;
  posts: number;
  /** Posts in the last 28 days ÷ 4. */
  postsPerWeek: number;
  /** Views of the latest 30 posts, oldest first (the sparkline). */
  trend: number[];
};

const newestFirst = (posts: ChannelPost[]) =>
  [...posts].sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0));

export function snapshot(posts: ChannelPost[], now = Date.now()): Snapshot {
  const x = multipliers(posts);
  const withViews = posts.filter((p) => p.views !== null);
  const hits = [...x.values()].filter((m) => m >= HIT_AT).length;
  const recent = posts.filter((p) => p.publishedAt && now - Date.parse(p.publishedAt) <= 28 * 864e5).length;
  return {
    usual: usualViewsExcluding(posts),
    hitRate: withViews.length >= HIT_RATE_MIN_POSTS ? hits / withViews.length : null,
    hits,
    posts: posts.length,
    postsPerWeek: Math.round((recent / 4) * 10) / 10,
    trend: newestFirst(withViews)
      .slice(0, 30)
      .reverse()
      .map((p) => p.views as number),
  };
}

export const DAY_PARTS = ["morning", "midday", "afternoon", "evening", "night"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** Morning 6-11, midday 11-14, afternoon 14-18, evening 18-22, night 22-6 (local hours). */
export function dayPart(hour: number): DayPart {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export type PostingPattern = {
  /** Monday first. */
  days: { day: number; hits: number; others: number }[];
  parts: { part: DayPart; hits: number; others: number }[];
};

/** Local weekday (0 = Monday) and hour of a time, in a time zone. */
function localTime(iso: string, timeZone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday), hour: hour % 24 };
}

/**
 * When the hits were posted vs the other posts (Bangkok time by default): a pattern in this account's own posts,
 * not a rule. Null with fewer than PATTERN_MIN_POSTS dated posts.
 */
export function postingPattern(posts: ChannelPost[], timeZone = "Asia/Bangkok"): PostingPattern | null {
  const x = multipliers(posts);
  const dated = posts.filter((p) => p.publishedAt && x.has(p.id));
  if (dated.length < PATTERN_MIN_POSTS) return null;
  const days = Array.from({ length: 7 }, (_, day) => ({ day, hits: 0, others: 0 }));
  const parts = DAY_PARTS.map((part) => ({ part, hits: 0, others: 0 }));
  for (const p of dated) {
    const { day, hour } = localTime(p.publishedAt!, timeZone);
    const key = (x.get(p.id) ?? 0) >= HIT_AT ? "hits" : "others";
    days[day][key]++;
    parts[DAY_PARTS.indexOf(dayPart(hour))][key]++;
  }
  return { days, parts };
}

/** Usual (median) views per calendar month for the last `months` months, oldest first: "is my normal growing?" */
export function monthlyUsual(posts: ChannelPost[], now = Date.now(), months = 4): { month: string; usual: number | null; posts: number }[] {
  const at = new Date(now);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - (months - 1 - i), 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const inMonth = posts.filter((p) => p.publishedAt?.startsWith(key) && p.views !== null);
    const m = median(inMonth.map((p) => p.views as number));
    return { month: key, usual: m === null ? null : Math.round(m), posts: inMonth.length };
  });
}

// ---------- Charts (v0.3 round 2, C1) ----------

/** One post on the performance timeline: when, how many views, and whether it was a hit. Oldest first. */
export type TimelinePoint = { id: string; t: number; views: number; x: number | null; hit: boolean };

export function timelinePoints(posts: ChannelPost[]): TimelinePoint[] {
  const x = multipliers(posts);
  return posts
    .filter((p) => p.publishedAt && p.views !== null)
    .map((p) => ({ id: p.id, t: Date.parse(p.publishedAt!), views: p.views as number, x: x.get(p.id) ?? null, hit: (x.get(p.id) ?? 0) >= HIT_AT }))
    .sort((a, b) => a.t - b.t);
}

/** Formats and hook types the AI tags each post with (fixed lists, so the charts can compare them). */
export const POST_FORMATS = ["talkingHead", "screenDemo", "skit", "tutorial", "textSlides", "productShowcase", "behindScenes", "review", "other"] as const;
export const HOOK_TYPES = ["question", "boldClaim", "pain", "howTo", "pov", "commentToGet", "other"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];
export type HookType = (typeof HOOK_TYPES)[number];
export type PostTag = { format: PostFormat; hook: HookType };

export const LENGTH_BUCKETS = ["under15", "s15to30", "s30to60", "over60"] as const;
export type LengthBucket = (typeof LENGTH_BUCKETS)[number];

export function lengthBucket(seconds: number | null | undefined): LengthBucket | null {
  if (seconds === null || seconds === undefined || seconds <= 0) return null;
  if (seconds < 15) return "under15";
  if (seconds < 30) return "s15to30";
  if (seconds <= 60) return "s30to60";
  return "over60";
}

/** A group needs this many posts before its numbers mean anything; smaller ones show as "too few to tell". */
export const GROUP_MIN_POSTS = 3;

export type GroupRow = { key: string; posts: number; medianX: number | null; hitRate: number | null; enough: boolean };

/**
 * How each group of posts (a format, a hook type, a length) does against the channel's own usual: median multiplier
 * and hit rate. Groups with enough posts come first, best first; small groups follow, flagged.
 */
export function groupPerformance(posts: ChannelPost[], keyOf: (p: ChannelPost) => string | null): GroupRow[] {
  const x = multipliers(posts);
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const key = keyOf(p);
    const m = x.get(p.id);
    if (!key || m === undefined) continue;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([key, ms]) => ({
      key,
      posts: ms.length,
      medianX: median(ms),
      hitRate: ms.filter((m) => m >= HIT_AT).length / ms.length,
      enough: ms.length >= GROUP_MIN_POSTS,
    }))
    .sort((a, b) => Number(b.enough) - Number(a.enough) || (b.medianX ?? 0) - (a.medianX ?? 0));
}

/** One channel in "You vs accounts you track". */
export type CompareRow = {
  handle: string;
  own: boolean;
  usual: number | null;
  hitRate: number | null;
  postsPerWeek: number;
  /** Median engagement (likes + comments + saves + shares per view) of its posts. */
  engagement: number | null;
  posts: number;
};

export function compareChannels(
  channels: { handle: string; own: boolean; posts: (ChannelPost & { engagement: number | null })[] }[],
  now = Date.now(),
): CompareRow[] {
  return channels.map((c) => {
    const s = snapshot(c.posts, now);
    const engagement = median(c.posts.map((p) => p.engagement).filter((e): e is number => e !== null));
    return { handle: c.handle, own: c.own, usual: s.usual, hitRate: s.hitRate, postsPerWeek: s.postsPerWeek, engagement, posts: s.posts };
  });
}

/** Daily snapshots → the last value of each week (weeks start Monday), oldest first. */
export function weeklyGrowth(snapshots: { day: string; followers: number | null; usual: number | null }[]): { week: string; followers: number | null; usual: number | null }[] {
  const weeks = new Map<string, { day: string; followers: number | null; usual: number | null }>();
  for (const s of [...snapshots].sort((a, b) => a.day.localeCompare(b.day))) {
    const d = new Date(`${s.day}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
    weeks.set(monday, s);
  }
  return [...weeks.entries()].map(([week, s]) => ({ week, followers: s.followers, usual: s.usual }));
}
