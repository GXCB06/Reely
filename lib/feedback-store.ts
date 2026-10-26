import "server-only";
import type { Platform } from "@/lib/adapters/types";
import { buildFeedback, type Feedback, type Vote, type VotedClip } from "@/lib/feedback";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Votes per product are few (a user taps 👍/👎 on some clips), so the last 200 are plenty. */
const MAX_VOTES = 200;

/** A product's 👍/👎, most recent first: what Reely learned (null when none) and the vote per video id. */
export async function loadFeedback(
  supabase: Supabase,
  productId: string | null,
): Promise<{ feedback: Feedback | null; votes: Map<number, Vote> }> {
  if (!productId) return { feedback: null, votes: new Map() };
  const { data } = await supabase
    .from("clip_feedback")
    .select("video_id, vote, videos(platform, platform_video_id, creator_handle, caption)")
    .eq("product_id", productId)
    .order("updated_at", { ascending: false })
    .limit(MAX_VOTES);
  type Row = {
    video_id: number;
    vote: Vote;
    videos: { platform: Platform; platform_video_id: string; creator_handle: string; caption: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const clips: VotedClip[] = rows.flatMap((r) =>
    r.videos
      ? [{ platform: r.videos.platform, platformVideoId: r.videos.platform_video_id, creatorHandle: r.videos.creator_handle, caption: r.videos.caption, vote: r.vote }]
      : [],
  );
  return { feedback: buildFeedback(clips), votes: new Map(rows.map((r) => [r.video_id, r.vote])) };
}
