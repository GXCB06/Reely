import "server-only";
import { instagramPost } from "@/lib/adapters/instagram-scrapecreators";
import { tiktokVideo } from "@/lib/adapters/tiktok-scrapecreators";
import type { NormalizedVideo, Platform } from "@/lib/adapters/types";
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

/** True while today's pasted-link budget (reads + creator lookups, for everyone) has room; counts this one. */
async function takeImportSlot(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: usage } = await admin
    .from("api_usage")
    .select("calls")
    .eq("day", new Date().toISOString().slice(0, 10))
    .eq("provider", "reely")
    .eq("endpoint", "clip-import")
    .maybeSingle();
  if (((usage?.calls as number | undefined) ?? 0) >= IMPORTS_PER_DAY) return false;
  await logApiCall("reely", "clip-import");
  return true;
}

/**
 * "Paste a clip link": the clip itself (cached 24 h, otherwise 1 credit, ~7 s). The video page then shows the
 * real-hook breakdown and "my version" like any clip found by a research, and asks for the creator's usual views
 * (`lookUpClipCreator`) while it is open: Instagram's profile feed takes ~20 s, too long to wait on in the chat.
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

  if (!(await takeImportSlot(admin))) return { ok: false, error: "limit" };

  const video = await (link.platform === "instagram" ? instagramPost(link.url) : tiktokVideo(link.url)).catch((e) => {
    console.warn("[clip-import] lookup failed", link.url, (e as Error).message);
    return undefined;
  });
  if (video === undefined) return { ok: false, error: "failed" };
  if (!video?.creatorHandle) return { ok: false, error: "notFound" };

  const id = (await saveVideos([video])).get(`${video.platform}:${video.platformVideoId}`);
  return id ? { ok: true, videoId: id, video } : { ok: false, error: "failed" };
}

/**
 * A pasted clip's creator: usual views from one page of their feed (1 credit on Instagram, 2 on TikTok). Skipped when
 * Reely already knows them (an older value is fine for one clip's multiplier). Counts toward the pasted-link budget.
 */
export async function lookUpClipCreator(platform: Platform, handle: string): Promise<"done" | "known" | "limit" | "failed"> {
  const admin = createAdminClient();
  if (!admin || platform === "youtube") return "failed";
  const { data } = await admin.from("creators").select("usual_views").eq("platform", platform).eq("handle", handle).maybeSingle();
  if (data?.usual_views) return "known";
  if (!(await takeImportSlot(admin))) return "limit";
  return lookUpCreator(platform, handle).then(
    () => "done" as const,
    (e) => {
      console.warn("[clip-import] usual views failed", handle, (e as Error).message);
      return "failed" as const;
    },
  );
}
