import "server-only";
import { after } from "next/server";
import { adapters } from "@/lib/adapters";
import { instagramReels } from "@/lib/adapters/instagram-scrapecreators";
import { tiktokProfileVideos } from "@/lib/adapters/tiktok-scrapecreators";
import type { NormalizedVideo, Platform } from "@/lib/adapters/types";
import { saveCreator, saveVideos } from "@/lib/cache";
import { usualViewsExcluding } from "@/lib/scoring";
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
