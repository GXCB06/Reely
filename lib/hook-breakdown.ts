import "server-only";
import { fetchTranscript, TRANSCRIPT_ENDPOINTS } from "@/lib/adapters/transcripts-scrapecreators";
import type { HookBreakdown } from "@/lib/ai/schemas";
import { breakDownHook } from "@/lib/ai/tasks";
import type { VideoRow } from "@/lib/db-mappers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Segment } from "@/lib/transcript";

/** Transcripts cost 1 credit each and are read only when a user asks; this caps a runaway day for everyone. */
const TRANSCRIPTS_PER_DAY = 100;
/** The vendor only transcribes clips under 2 minutes. */
const MAX_SECONDS = 120;

export type HookView = { segments: Segment[]; breakdown: HookBreakdown | null };
export type HookResult = { ok: true; view: HookView } | { ok: false; error: "none" | "tooLong" | "limit" | "failed" };

/**
 * The real hook of a clip: its timed transcript (cached for everyone; fetched once, 1 credit) and the AI breakdown
 * in the user's language (cached per locale). A clip without speech is remembered, so it is never paid for twice.
 */
export async function readHook(video: VideoRow, locale: string): Promise<HookResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  const { data: cached } = await admin.from("video_transcripts").select("status, segments, breakdowns").eq("video_id", video.id).maybeSingle();
  if (cached?.status === "none") return { ok: false, error: "none" };

  let segments = (cached?.segments as Segment[] | undefined) ?? [];
  if (!cached) {
    if ((video.duration_seconds ?? 0) > MAX_SECONDS) return { ok: false, error: "tooLong" };
    const { data: usage } = await admin
      .from("api_usage")
      .select("calls")
      .eq("day", new Date().toISOString().slice(0, 10))
      .eq("provider", "scrapecreators")
      .in("endpoint", TRANSCRIPT_ENDPOINTS);
    if ((usage ?? []).reduce((sum, r) => sum + (r.calls as number), 0) >= TRANSCRIPTS_PER_DAY) return { ok: false, error: "limit" };

    const transcript = await fetchTranscript(video.platform, video.url).catch((e) => {
      console.warn("[hook] transcript failed", video.id, (e as Error).message);
      return undefined;
    });
    if (transcript === undefined) return { ok: false, error: "failed" };
    if (!transcript) {
      await admin.from("video_transcripts").upsert({ video_id: video.id, status: "none" });
      return { ok: false, error: "none" };
    }
    segments = transcript.segments;
    await admin.from("video_transcripts").upsert({ video_id: video.id, status: "ok", segments, language: transcript.language });
  }

  const breakdowns = (cached?.breakdowns as Record<string, HookBreakdown> | undefined) ?? {};
  let breakdown: HookBreakdown | null = breakdowns[locale] ?? null;
  if (!breakdown) {
    breakdown = await breakDownHook(
      { caption: video.caption, platform: video.platform, handle: video.creator_handle, duration: video.duration_seconds },
      segments,
      locale,
    );
    if (breakdown) await admin.from("video_transcripts").update({ breakdowns: { ...breakdowns, [locale]: breakdown } }).eq("video_id", video.id);
  }
  return { ok: true, view: { segments, breakdown } };
}
