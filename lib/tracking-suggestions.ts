import "server-only";
import type { Platform } from "@/lib/adapters/types";
import type { SimilarAccount } from "@/lib/search";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SuggestedAccount = {
  platform: Platform;
  handle: string;
  usualViews: number | null;
  /** The account's best clip in the user's researches (or the search match). */
  best: { id: number; thumbnailUrl: string | null; views: number | null; usual: number | null } | null;
  hits: number;
  /** A product like the user's, promoting itself (from a research's "From similar products"). */
  similar: boolean;
  /** The user's researches (product names) this account turned up in, newest first. */
  from: string[];
  /** The first line of its best clip's caption: what the account posts about. */
  sample: string | null;
};

/** A caption's first line with text, without hashtags, max 90 characters: what the account posts about. */
function captionLine(caption: string | null | undefined) {
  const line = (caption ?? "").split("\n").map((l) => l.replace(/#[^\s#]+/g, "").trim()).find(Boolean) ?? "";
  return line ? (line.length > 90 ? `${line.slice(0, 89)}…` : line) : null;
}

const MAX_SUGGESTIONS = 12;

type Row = {
  run_id: string;
  usual_score: number | null;
  videos: { id: number; platform: Platform; creator_handle: string; thumbnail_url: string | null; views: number | null; caption: string } | null;
};

/**
 * Tracking page: accounts worth following, from the user's own researches (no external calls): similar products
 * first, then creators whose clips beat their usual views most often. Accounts already tracked are left out.
 */
export async function suggestedAccounts(supabase: Supabase, tracked: Set<string>): Promise<SuggestedAccount[]> {
  const { data: runs } = await supabase.from("research_runs").select("id, title, stats").order("created_at", { ascending: false }).limit(15);
  if (!runs?.length) return [];
  const titleOf = new Map(runs.map((r) => [r.id as string, (r.title as string | null) ?? ""]));
  const similar = new Set(
    runs.flatMap((r) => ((r.stats as { similarAccounts?: SimilarAccount[] } | null)?.similarAccounts ?? []).map((a) => `${a.platform}:${a.handle}`)),
  );
  const { data } = await supabase
    .from("run_results")
    .select("run_id, usual_score, videos(id, platform, creator_handle, thumbnail_url, views, caption)")
    .in("run_id", runs.map((r) => r.id))
    .or(`usual_score.gte.3,label.eq.breakout`)
    .order("usual_score", { ascending: false, nullsFirst: false })
    .limit(300);

  const byAccount = new Map<string, SuggestedAccount>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const v = r.videos;
    if (!v?.creator_handle) continue;
    const key = `${v.platform}:${v.creator_handle}`;
    if (tracked.has(key)) continue;
    const a = byAccount.get(key);
    const usual = r.usual_score === null ? null : Number(r.usual_score);
    const title = titleOf.get(r.run_id) ?? "";
    if (a) {
      a.hits++;
      if (title && !a.from.includes(title)) a.from.push(title);
      continue;
    }
    byAccount.set(key, {
      platform: v.platform,
      handle: v.creator_handle,
      usualViews: null,
      best: { id: v.id, thumbnailUrl: v.thumbnail_url, views: v.views, usual },
      hits: 1,
      similar: similar.has(key),
      from: title ? [title] : [],
      sample: captionLine(v.caption),
    });
  }
  const picked = [...byAccount.values()]
    .sort((a, b) => Number(b.similar) - Number(a.similar) || b.hits - a.hits || (b.best?.usual ?? 0) - (a.best?.usual ?? 0))
    .slice(0, MAX_SUGGESTIONS);
  return withUsualViews(supabase, picked);
}

/** Tracking page search: creators Reely has already seen (shared cache, free), by handle. */
export async function searchKnownAccounts(supabase: Supabase, query: string, tracked: Set<string>): Promise<SuggestedAccount[]> {
  const q = query.trim().replace(/^@/, "").replace(/[%_,()]/g, "");
  if (q.length < 2) return [];
  const { data } = await supabase
    .from("creators")
    .select("platform, handle, usual_views")
    .ilike("handle", `%${q}%`)
    .order("usual_views", { ascending: false, nullsFirst: false })
    .limit(MAX_SUGGESTIONS);
  const accounts: SuggestedAccount[] = (data ?? [])
    .filter((c) => !tracked.has(`${c.platform}:${c.handle}`))
    .map((c) => ({
      platform: c.platform as Platform,
      handle: c.handle as string,
      usualViews: (c.usual_views as number | null) ?? null,
      best: null,
      hits: 0,
      similar: false,
      from: [],
      sample: null,
    }));
  // Each match's most-viewed stored clip, for a cover.
  await Promise.all(
    accounts.map(async (a) => {
      const { data: v } = await supabase
        .from("videos")
        .select("id, thumbnail_url, views, caption")
        .eq("platform", a.platform)
        .eq("creator_handle", a.handle)
        .order("views", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!v) return;
      a.best = { id: v.id as number, thumbnailUrl: v.thumbnail_url as string | null, views: v.views as number | null, usual: null };
      a.sample = captionLine(v.caption as string);
    }),
  );
  return accounts;
}

async function withUsualViews(supabase: Supabase, accounts: SuggestedAccount[]) {
  if (!accounts.length) return accounts;
  const { data } = await supabase
    .from("creators")
    .select("platform, handle, usual_views")
    .in("handle", accounts.map((a) => a.handle));
  const usual = new Map((data ?? []).map((c) => [`${c.platform}:${c.handle}`, c.usual_views as number | null]));
  return accounts.map((a) => ({ ...a, usualViews: usual.get(`${a.platform}:${a.handle}`) ?? null }));
}
