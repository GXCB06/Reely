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
