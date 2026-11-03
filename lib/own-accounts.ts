import "server-only";
import { after } from "next/server";
import { adapters } from "@/lib/adapters";
import { instagramReels } from "@/lib/adapters/instagram-scrapecreators";
import { tiktokProfileVideos } from "@/lib/adapters/tiktok-scrapecreators";
import type { NormalizedVideo, Platform } from "@/lib/adapters/types";
import { saveCreator, saveVideos } from "@/lib/cache";
import { type AuditClip, auditChannel } from "@/lib/ai/tasks";
import { resolveAudit, type StoredAudit } from "@/lib/channel-audit";
import { isGoal } from "@/lib/goals";
import { usualScore, usualViewsExcluding } from "@/lib/scoring";
import type { createClient } from "@/lib/supabase/server";
import { persistThumbnails } from "@/lib/thumbs";
import { loadAccount, refreshIfStale } from "@/lib/tracking";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Own channels per product (v0.3 plan). */
export const MAX_PER_PRODUCT = 3;
/** Posts read for a channel page: the deep read plus what later refreshes add to the shared cache. */
export const CHANNEL_POSTS = 60;

/**
 * The one deeper read when a channel is added, so its first analysis has enough posts (cost rule 23): TikTok 4 pages
 * (~40 posts, 4 credits), Instagram 3 pages (~36 reels, 3 credits), YouTube free (up to 50).
 */
async function deepRead(platform: Platform, handle: string): Promise<NormalizedVideo[]> {
  if (platform === "tiktok") return tiktokProfileVideos(handle, 4);
  if (platform === "instagram") return instagramReels(handle, 3);
  return adapters.youtube!.getCreatorVideos(handle);
}

export type AddResult = { ok: true } | { ok: false; error: "limit" | "exists" | "notFound" | "failed" };

/** Adds one of the user's own channels to a product: at most 3 per product, then the one deep read into the cache. */
export async function addOwnAccount(supabase: Supabase, productId: string, platform: Platform, handle: string): Promise<AddResult> {
  const { count } = await supabase.from("own_accounts").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((count ?? 0) >= MAX_PER_PRODUCT) return { ok: false, error: "limit" };
  const { data: row, error } = await supabase.from("own_accounts").insert({ product_id: productId, platform, handle }).select("id").single();
  if (error?.code === "23505") return { ok: false, error: "exists" };
  if (error || !row) return { ok: false, error: "failed" };

  const posts = await deepRead(platform, handle).catch((e: Error) => {
    console.warn("[own-accounts] deep read failed", platform, handle, e.message);
    return null;
  });
  // A handle that doesn't exist (or a private account) is not kept: nothing to analyse.
  if (!posts?.length) {
    await supabase.from("own_accounts").delete().eq("id", row.id);
    return { ok: false, error: posts ? "notFound" : "failed" };
  }
  await saveVideos(posts);
  after(() => persistThumbnails(posts));
  await saveCreator(platform, handle, {
    followers: posts.find((p) => p.creatorFollowers !== null)?.creatorFollowers ?? null,
    usualViews: usualViewsExcluding(posts.map((p) => ({ id: p.platformVideoId, views: p.views }))),
    sampleSize: posts.length,
    displayName: posts[0].creatorName,
  });
  await supabase.from("own_accounts").update({ deep_read_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}

/**
 * One own channel for its page: refreshed through the shared 24-hour cache when the page is opened (cost rule 5:
 * TikTok 2 credits, Instagram 1, YouTube free), then up to 60 cached posts scored against the channel's own normal.
 */
export async function loadOwnChannel(platform: Platform, handle: string) {
  await refreshIfStale(platform, handle);
  return loadAccount(platform, handle, Date.now(), CHANNEL_POSTS);
}

/** Posts the audit reads (the biggest first) and watched clips it compares with. */
const AUDIT_POSTS = 40;
const WATCHED_CLIPS = 12;

type WatchedClip = AuditClip & { id: number };

/**
 * What the founder watches, from the cache only (no credits): their tracked accounts' clips at 2x+ their usual in the
 * last 90 days (up to 8), then the product's latest research's best exact matches, up to 12 clips in all.
 */
async function watchedClips(supabase: Supabase, productId: string, ownHandle: string): Promise<WatchedClip[]> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: tracked }, { data: run }] = await Promise.all([
    supabase.from("tracked_accounts").select("platform, handle").limit(10),
    supabase.from("research_runs").select("id").eq("product_id", productId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const handles = [...new Set((tracked ?? []).map((t) => t.handle as string))].filter((h) => h !== ownHandle);
  const [{ data: trackedVideos }, { data: creators }, { data: results }] = await Promise.all([
    handles.length
      ? supabase.from("videos").select("id, creator_handle, platform, views, caption").in("creator_handle", handles).gte("published_at", since).order("views", { ascending: false }).limit(60)
      : Promise.resolve({ data: [] }),
    handles.length ? supabase.from("creators").select("platform, handle, usual_views").in("handle", handles) : Promise.resolve({ data: [] }),
    run ? supabase.from("run_results").select("video_id, relevance, usual_score, videos(id, creator_handle, views, caption)").eq("run_id", run.id).order("rank").limit(20) : Promise.resolve({ data: [] }),
  ]);
  const usualOf = new Map((creators ?? []).map((c) => [`${c.platform}:${c.handle}`, c.usual_views as number | null]));
  const fromTracked = (trackedVideos ?? [])
    .map((v) => ({ id: v.id as number, handle: v.creator_handle as string, views: v.views as number | null, caption: v.caption as string, usual: usualScore(v.views as number | null, usualOf.get(`${v.platform}:${v.creator_handle}`) ?? null) }))
    .filter((v) => (v.usual ?? 0) >= 2)
    .sort((a, b) => (b.usual ?? 0) - (a.usual ?? 0))
    .slice(0, 8);
  type ResultRow = { relevance: number | null; usual_score: number | null; videos: { id: number; creator_handle: string; views: number | null; caption: string } | null };
  const fromResearch = ((results ?? []) as unknown as ResultRow[])
    .filter((r) => r.videos && r.relevance !== 0 && r.relevance !== 1 && r.videos.creator_handle !== ownHandle)
    .map((r) => ({ id: r.videos!.id, handle: r.videos!.creator_handle, views: r.videos!.views, caption: r.videos!.caption, usual: r.usual_score }));
  const seen = new Set<number>();
  return [...fromTracked, ...fromResearch].filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, WATCHED_CLIPS);
}

/** "Wed 15:00" in Bangkok time, for the audit prompt. */
const postedAt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : null;

export type AuditResult = { ok: true; audit: StoredAudit; fresh: boolean } | { ok: false; error: "notFound" | "noPosts" | "failed" };

/**
 * "Analyse my channel": one AI call, kept on `own_accounts` until the channel's posts are refreshed (a second tap before
 * then returns the stored one). Reads only the cache: no credits.
 */
export async function analyseChannel(supabase: Supabase, platform: Platform, handle: string, locale: string): Promise<AuditResult> {
  const { data: own } = await supabase.from("own_accounts").select("id, product_id, audit, audit_at").eq("platform", platform).eq("handle", handle).maybeSingle();
  if (!own) return { ok: false, error: "notFound" };
  const { data: creator } = await supabase.from("creators").select("fetched_at").eq("platform", platform).eq("handle", handle).maybeSingle();
  const fetchedAt = creator?.fetched_at ? Date.parse(creator.fetched_at as string) : 0;
  if (own.audit && own.audit_at && Date.parse(own.audit_at as string) >= fetchedAt) {
    return { ok: true, audit: own.audit as StoredAudit, fresh: false };
  }
  const [stats, { data: product }, clips] = await Promise.all([
    loadAccount(platform, handle, Date.now(), CHANNEL_POSTS),
    supabase.from("products").select("name, url, description, audience, goal").eq("id", own.product_id).maybeSingle(),
    watchedClips(supabase, own.product_id as string, handle),
  ]);
  const posts = stats.videos.filter((v) => v.dbId).slice(0, AUDIT_POSTS);
  if (!posts.length || !product) return { ok: false, error: "noPosts" };
  const raw = await auditChannel({
    handle,
    platform,
    posts: posts.map((v) => ({ views: v.views, usual: v.usual, seconds: v.durationSeconds, postedAt: postedAt(v.publishedAt), caption: v.caption })),
    clips,
    product: { name: product.name as string, url: (product.url as string | null) ?? null, description: (product.description as string | null) ?? null, audience: (product.audience as string | null) ?? null },
    goal: isGoal(product.goal) ? product.goal : null,
    locale,
  });
  if (!raw) return { ok: false, error: "failed" };
  const audit = resolveAudit(raw, posts.map((v) => v.dbId!), clips.map((c) => c.id));
  await supabase.from("own_accounts").update({ audit, audit_at: new Date().toISOString() }).eq("id", own.id);
  return { ok: true, audit, fresh: true };
}
