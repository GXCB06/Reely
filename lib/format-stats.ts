// Pure helpers for the format explorer: posts per day, trend stage and sounds. No server imports (tested directly).

export type FormatStage = "fresh" | "rising" | "steady" | "fading";

type Post = { publishedAt: string | null; views: number | null; creatorHandle: string; sound?: { id: string; title: string } | null };

const DAY = 864e5;

/** Videos posted per day for the last `days` days, oldest first (UTC days). */
export function postsPerDay(posts: Post[], now = Date.now(), days = 30): { day: string; count: number }[] {
  const start = Math.floor(now / DAY) - (days - 1);
  const counts = new Array<number>(days).fill(0);
  for (const p of posts) {
    if (!p.publishedAt) continue;
    const i = Math.floor(new Date(p.publishedAt).getTime() / DAY) - start;
    if (i >= 0 && i < days) counts[i]++;
  }
  return counts.map((count, i) => ({ day: new Date((start + i) * DAY).toISOString().slice(0, 10), count }));
}

/**
 * Where a format is in its life, from creators posting it this week vs last week:
 * fresh = first seen in the last 14 days; rising = up 30%+; fading = down 40%+; otherwise steady.
 */
export function formatStage(posts: Post[], now = Date.now()): { stage: FormatStage; thisWeek: number; lastWeek: number } {
  const dated = posts.filter((p) => p.publishedAt).map((p) => ({ ...p, t: new Date(p.publishedAt!).getTime() }));
  const creatorsIn = (from: number, to: number) => new Set(dated.filter((p) => p.t > now - from && p.t <= now - to).map((p) => p.creatorHandle)).size;
  const thisWeek = creatorsIn(7 * DAY, 0);
  const lastWeek = creatorsIn(14 * DAY, 7 * DAY);
  const first = Math.min(...dated.map((p) => p.t));
  let stage: FormatStage = "steady";
  if (dated.length && now - first <= 14 * DAY) stage = "fresh";
  else if (thisWeek >= Math.max(1, lastWeek) * 1.3) stage = "rising";
  else if (lastWeek > 0 && thisWeek <= lastWeek * 0.6) stage = "fading";
  return { stage, thisWeek, lastWeek };
}

/** The sounds used most often in a format, with how well they did on average. */
export function topSounds(posts: Post[], limit = 5): { id: string; title: string; count: number; avgViews: number }[] {
  const by = new Map<string, { title: string; count: number; views: number }>();
  for (const p of posts) {
    if (!p.sound) continue;
    const s = by.get(p.sound.id) ?? { title: p.sound.title, count: 0, views: 0 };
    s.count++;
    s.views += p.views ?? 0;
    by.set(p.sound.id, s);
  }
  return [...by.entries()]
    .map(([id, s]) => ({ id, title: s.title, count: s.count, avgViews: Math.round(s.views / s.count) }))
    .sort((a, b) => b.count - a.count || b.avgViews - a.avgViews)
    .slice(0, limit);
}
