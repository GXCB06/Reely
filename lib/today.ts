import "server-only";
import type { Platform, SearchRegion } from "@/lib/adapters/types";
import { type ProductBrief, pickTodayIdeas } from "@/lib/ai/tasks";
import { bestScore, keepRate, type OutlierLabel } from "@/lib/scoring";
import { type ScoredVideo, searchKeywords } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { loadAccount, refreshIfStale } from "@/lib/tracking";

// Today page: new breakouts (last 7 days) from tracked accounts and followed topics, turned into 3-5
// ideas. Built at most once per user per day, when the page is opened (cost rule 5 applies).
const WEEK_MS = 7 * 864e5;
const TOPIC_KEYWORDS = 3;
const MAX_CANDIDATES = 20;
const HISTORY_DAYS = 14;

export type TodayItem = {
  videoId: number;
  title: string;
  why: string;
  hook: string;
  angle: string;
  source: "tracked" | "topic";
  sourceLabel: string;
  scores: { usual: number | null; reach: number | null; usualViews: number | null; label: OutlierLabel };
};
export type TodayStats = { trackedAccounts: number; topics: number; candidates: number };

/** Today's date in Bangkok (the digest resets at local midnight). */
export function bangkokDay(now = Date.now()) {
  return new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
}

export async function getTodayDigest(day = bangkokDay()) {
  const supabase = await createClient();
  const { data } = await supabase.from("daily_digests").select("items, stats, created_at").eq("day", day).maybeSingle();
  return data ? { items: data.items as TodayItem[], stats: data.stats as TodayStats, createdAt: data.created_at as string } : null;
}

export async function countTodaySources() {
  const supabase = await createClient();
  const [{ count: tracked }, { count: topics }] = await Promise.all([
    supabase.from("tracked_accounts").select("id", { count: "exact", head: true }),
    supabase.from("research_runs").select("id", { count: "exact", head: true }).not("followed_at", "is", null),
  ]);
  return { tracked: tracked ?? 0, topics: topics ?? 0 };
}

type Candidate = ScoredVideo & { source: "tracked" | "topic"; sourceLabel: string };

export async function buildTodayDigest(locale: string): Promise<{ ok: true } | { ok: false; error: "no-sources" | "failed" }> {
  const supabase = await createClient();
  const day = bangkokDay();
  if (await getTodayDigest(day)) return { ok: true };

  const [{ data: accounts }, { data: topics }, { data: productRow }, { data: history }] = await Promise.all([
    supabase.from("tracked_accounts").select("platform, handle"),
    supabase
      .from("research_runs")
      .select("id, title, brief, keywords, keyword_regions, exclusions, platforms, input")
      .not("followed_at", "is", null),
    supabase.from("products").select("name, description, audience").limit(1).maybeSingle(),
    supabase
      .from("daily_digests")
      .select("items")
      .gte("day", bangkokDay(Date.now() - HISTORY_DAYS * 864e5)),
  ]);
  if (!accounts?.length && !topics?.length) return { ok: false, error: "no-sources" };

  // Skip videos already suggested in the last two weeks: Today should always be new.
  const shownBefore = new Set((history ?? []).flatMap((d) => (d.items as TodayItem[]).map((i) => i.videoId)));
  const now = Date.now();
  const isNewWinner = (v: ScoredVideo) =>
    v.label !== "normal" &&
    v.dbId !== undefined &&
    !shownBefore.has(v.dbId) &&
    v.publishedAt !== null &&
    now - new Date(v.publishedAt).getTime() <= WEEK_MS;

  // 1. Tracked accounts: refresh stale ones (shared 24 h cache), then read their recent posts.
  const fromAccounts = await Promise.all(
    (accounts ?? [])
      .filter((a) => a.platform !== "instagram")
      .map(async (a): Promise<Candidate[]> => {
        const platform = a.platform as Platform;
        await refreshIfStale(platform, a.handle);
        const stats = await loadAccount(platform, a.handle);
        return stats.videos.filter(isNewWinner).map((v) => ({ ...v, source: "tracked", sourceLabel: `@${a.handle}` }));
      }),
  );

  // 2. Followed topics: re-search the first 3 keywords on TikTok for the last 7 days.
  const fromTopics = await Promise.all(
    (topics ?? []).map(async (t): Promise<Candidate[]> => {
      const input = (t.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string };
      const regions = (t.keyword_regions as SearchRegion[] | null) ?? [];
      const keywords = (t.keywords as string[]).slice(0, TOPIC_KEYWORDS).map((text, i) => ({ text, region: regions[i] ?? "th" }));
      const product = input.productName ? { name: input.productName, whatItIs: input.whatItIs ?? "", audience: input.audience ?? "" } : undefined;
      const result = await searchKeywords(keywords, ["tiktok"], (t.exclusions as string[]) ?? [], { product, days: 7, minViews: 5_000 });
      const label = (t.title as string | null) || (t.brief as string).slice(0, 40);
      return result.videos.filter(isNewWinner).map((v) => ({ ...v, source: "topic", sourceLabel: label }));
    }),
  );

  const seen = new Set<number>();
  const candidates = [...fromAccounts.flat(), ...fromTopics.flat()]
    .filter((v) => !seen.has(v.dbId!) && seen.add(v.dbId!))
    .sort((a, b) => bestScore(b) - bestScore(a))
    .slice(0, MAX_CANDIDATES);

  const product: ProductBrief | null = productRow
    ? { name: productRow.name, whatItIs: productRow.description ?? "", audience: productRow.audience ?? "" }
    : null;
  const ideas = await pickTodayIdeas(
    product,
    candidates.map((v) => ({
      handle: v.creatorHandle,
      caption: v.caption,
      views: v.views,
      multiplier: v.usual ?? v.reach,
      keepRate: keepRate(v),
      source: v.source === "tracked" ? `tracked ${v.sourceLabel}` : `topic "${v.sourceLabel}"`,
    })),
    locale,
  );

  const items: TodayItem[] = ideas.map((idea) => {
    const v = candidates[idea.i];
    return {
      videoId: v.dbId!,
      title: idea.title,
      why: idea.why,
      hook: idea.hook,
      angle: idea.angle,
      source: v.source,
      sourceLabel: v.sourceLabel,
      scores: { usual: v.usual, reach: v.reach, usualViews: v.usualViews, label: v.label },
    };
  });
  const stats: TodayStats = { trackedAccounts: accounts?.length ?? 0, topics: topics?.length ?? 0, candidates: candidates.length };

  // Saved even when empty, so reopening the page today doesn't spend credits again.
  const { error } = await supabase
    .from("daily_digests")
    .upsert({ day, items, stats }, { onConflict: "user_id,day", ignoreDuplicates: true });
  return error ? { ok: false, error: "failed" } : { ok: true };
}
