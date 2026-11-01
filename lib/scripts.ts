import "server-only";
import type { HookBreakdown, Script } from "@/lib/ai/schemas";
import { makeMyVersion, type ProductInput } from "@/lib/ai/tasks";
import type { VideoRow } from "@/lib/db-mappers";
import type { Goal } from "@/lib/goals";
import { reachScore, usualScore } from "@/lib/scoring";
import type { createClient } from "@/lib/supabase/server";
import { firstSeconds, type Segment } from "@/lib/transcript";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SavedScript = { id: string; content: Script & { source: "ai" | "sample" }; created_at: string };

/**
 * Writes a script that adapts one clip's structure to a product (one AI call) and saves it to `scripts`, so it shows on
 * the clip's page. Used by the video page and by "Ask Reely". `productId` is null when the product isn't saved (a
 * research started from a description).
 */
export async function writeScript(
  supabase: Supabase,
  videoId: number,
  product: ProductInput & { id: string | null },
  lang: "th" | "en",
  goal: Goal | null,
): Promise<SavedScript | null> {
  const { data: video } = await supabase.from("videos").select("*").eq("id", videoId).maybeSingle<VideoRow>();
  if (!video) return null;

  const [{ data: creator }, { data: analysis }, { data: transcript }] = await Promise.all([
    supabase.from("creators").select("usual_views").eq("platform", video.platform).eq("handle", video.creator_handle).maybeSingle(),
    supabase.from("video_analyses").select("hook, format, angle").eq("video_id", videoId).maybeSingle(),
    supabase.from("video_transcripts").select("status, segments, breakdowns").eq("video_id", videoId).maybeSingle(),
  ]);
  // When the user read the clip's real hook, the script borrows from what is actually said, with its timing.
  const breakdowns = (transcript?.breakdowns ?? {}) as Record<string, HookBreakdown>;
  const real = breakdowns[lang] ?? Object.values(breakdowns)[0] ?? null;
  const spoken =
    transcript?.status === "ok"
      ? real
        ? { hook: real.hook, beats: real.beats, duration: video.duration_seconds }
        : { hook: firstSeconds(transcript.segments as Segment[], 3), beats: [], duration: video.duration_seconds }
      : null;

  const script = await makeMyVersion(
    product,
    {
      caption: video.caption,
      views: video.views,
      usual: usualScore(video.views, (creator?.usual_views as number | null) ?? null),
      reach: reachScore(video.views, video.creator_followers),
      handle: video.creator_handle,
      platform: video.platform,
      hook: analysis?.hook ?? null,
      format: analysis?.format ?? null,
      angle: analysis?.angle ?? null,
      spoken,
    },
    lang,
    // The product's goal picks the script structure (e.g. demo → proof → Shop basket for sellers).
    goal,
  );

  const { data: saved, error } = await supabase
    .from("scripts")
    .insert({ product_id: product.id, video_id: videoId, locale: lang, content: script })
    .select("id, content, created_at")
    .single();
  return error || !saved ? null : (saved as SavedScript);
}
