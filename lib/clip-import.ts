import "server-only";
import { instagramPost } from "@/lib/adapters/instagram-scrapecreators";
import { tiktokVideo } from "@/lib/adapters/tiktok-scrapecreators";
import type { NormalizedVideo } from "@/lib/adapters/types";
import { saveVideos } from "@/lib/cache";
import type { ClipLink } from "@/lib/clip-link";
import { lookUpCreator } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiCall } from "@/lib/usage";

/** Pasted clip links read per day, for everyone: 1 credit each, plus the creator's usual views (1-2, cached 24 h). */
const IMPORTS_PER_DAY = 60;
const FRESH_MS = 24 * 60 * 60 * 1000;

export type ImportResult =
  | { ok: true; videoId: number; video: NormalizedVideo | null }
  | { ok: false; error: "notFound" | "limit" | "failed" };

/**
 * "Paste a clip link": the clip (cached 24 h, otherwise 1 credit) and its creator's usual views, so the video page
 * shows the multiplier, the real-hook breakdown and "my version" like any clip found by a research.
 */
export async function importClip(link: ClipLink): Promise<ImportResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  if (link.id) {
    const { data } = await admin
      .from("videos")
      .select("id, fetched_at")
      .eq("platform", link.platform)
      .eq("platform_video_id", link.id)
      .maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at as string).getTime() < FRESH_MS) {
      return { ok: true, videoId: data.id as number, video: null };
    }
  }

  const { data: usage } = await admin
    .from("api_usage")
    .select("calls")
    .eq("day", new Date().toISOString().slice(0, 10))
    .eq("provider", "reely")
    .eq("endpoint", "clip-import")
    .maybeSingle();
  if (((usage?.calls as number | undefined) ?? 0) >= IMPORTS_PER_DAY) return { ok: false, error: "limit" };
  await logApiCall("reely", "clip-import");

  const video = await (link.platform === "instagram" ? instagramPost(link.url) : tiktokVideo(link.url)).catch((e) => {
    console.warn("[clip-import] lookup failed", link.url, (e as Error).message);
    return undefined;
  });
  if (video === undefined) return { ok: false, error: "failed" };
  if (!video?.creatorHandle) return { ok: false, error: "notFound" };

  await lookUpCreator(video.platform, video.creatorHandle).catch((e) => {
    console.warn("[clip-import] usual views failed", video.creatorHandle, (e as Error).message);
  });
  // Saved after the creator's feed, so the post's own numbers win.
  const id = (await saveVideos([video])).get(`${video.platform}:${video.platformVideoId}`);
  return id ? { ok: true, videoId: id, video } : { ok: false, error: "failed" };
}
