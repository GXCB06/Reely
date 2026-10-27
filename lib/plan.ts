import "server-only";
import { planWeek, type PlanClip } from "@/lib/ai/tasks";
import { type ResultRow, type VideoRow, videoFromResultRow, videoFromRow } from "@/lib/db-mappers";
import { withFeedback } from "@/lib/feedback";
import { loadFeedback } from "@/lib/feedback-store";
import { isGoal, scoreFor } from "@/lib/goals";
import { diverseTop } from "@/lib/results";
import type { ScoredVideo } from "@/lib/search";
import type { createClient } from "@/lib/supabase/server";
import { bangkokDay } from "@/lib/today";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PlanItem = { day: number; videoId: number; title: string; hook: string; format: string; why: string };
export type ContentPlan = { productId: string; startDay: string; items: PlanItem[]; updatedAt: string };

/** References the AI chooses from: enough for a varied week without a long prompt. */
const MAX_CLIPS = 24;

export async function getPlan(supabase: Supabase, productId: string): Promise<ContentPlan | null> {
  const { data } = await supabase.from("content_plans").select("product_id, start_day, items, updated_at").eq("product_id", productId).maybeSingle();
  return data
    ? { productId: data.product_id as string, startDay: data.start_day as string, items: data.items as PlanItem[], updatedAt: data.updated_at as string }
    : null;
}

/**
 * Builds this week's plan for a product from its 👍 clips, the user's saved clips and the best clips of its latest
 * research (👎 clips left out), then saves it (replacing the previous one). One AI call, no credits.
 */
export async function buildPlan(supabase: Supabase, productId: string, locale: string): Promise<{ ok: true } | { ok: false; error: "noClips" | "failed" }> {
  const [{ data: product }, { data: lastRun }, { data: savedRows }, { feedback }] = await Promise.all([
    supabase.from("products").select("id, name, description, audience, goal").eq("id", productId).maybeSingle(),
    supabase.from("research_runs").select("id, goal").eq("product_id", productId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("saved_videos").select("video_id").order("created_at", { ascending: false }).limit(12),
    loadFeedback(supabase, productId),
  ]);
  if (!product) return { ok: false, error: "failed" };
  const goal = isGoal(product.goal) ? product.goal : isGoal(lastRun?.goal) ? lastRun.goal : null;

  const { data: votes } = await supabase.from("clip_feedback").select("video_id").eq("product_id", productId).eq("vote", 1).order("updated_at", { ascending: false }).limit(12);
  const likedIds = (votes ?? []).map((v) => v.video_id as number);
  const savedIds = (savedRows ?? []).map((r) => r.video_id as number);
  const [{ data: picked }, { data: resultRows }] = await Promise.all([
    likedIds.length + savedIds.length ? supabase.from("videos").select("*").in("id", [...likedIds, ...savedIds]) : Promise.resolve({ data: [] }),
    lastRun
      ? supabase.from("run_results").select("keyword, reach_score, usual_score, usual_views, label, copyable, videos(*)").eq("run_id", lastRun.id).order("rank")
      : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map(((picked ?? []) as VideoRow[]).map((v) => [v.id, v]));
  const asVideo = (v: VideoRow) => videoFromRow(v, { reach: null, usual: null, usualViews: null, label: "normal" });
  const research = ((resultRows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null);
  const best = diverseTop(research, 12, 2, withFeedback<ScoredVideo>(scoreFor(goal), feedback));

  const candidates: { video: ScoredVideo; source: PlanClip["source"] }[] = [];
  const seen = new Set<number>();
  const add = (video: ScoredVideo | undefined, source: PlanClip["source"]) => {
    if (!video?.dbId || seen.has(video.dbId) || feedback?.disliked.has(`${video.platform}:${video.platformVideoId}`)) return;
    seen.add(video.dbId);
    candidates.push({ video, source });
  };
  likedIds.forEach((id) => add(byId.get(id) && asVideo(byId.get(id)!), "liked"));
  savedIds.forEach((id) => add(byId.get(id) && asVideo(byId.get(id)!), "saved"));
  best.forEach((v) => add(v, "research"));
  const clips = candidates.slice(0, MAX_CLIPS);
  if (!clips.length) return { ok: false, error: "noClips" };

  // Real opening lines for clips whose transcript someone already read (free, cached).
  const { data: transcripts } = await supabase.from("video_transcripts").select("video_id, breakdowns").eq("status", "ok").in("video_id", clips.map((c) => c.video.dbId!));
  const spoken = new Map(
    (transcripts ?? []).map((t) => [t.video_id as number, Object.values((t.breakdowns ?? {}) as Record<string, { hook?: string }>)[0]?.hook ?? null]),
  );

  const days = await planWeek(
    { name: product.name as string, whatItIs: (product.description as string | null) ?? "", audience: (product.audience as string | null) ?? "" },
    goal,
    clips.map(({ video: v, source }) => ({
      handle: v.creatorHandle,
      caption: v.caption,
      views: v.views,
      multiplier: v.usual ?? v.reach,
      platform: v.platform,
      source,
      spokenHook: spoken.get(v.dbId!) ?? null,
    })),
    locale,
  );
  if (!days?.length) return { ok: false, error: "failed" };
  const items: PlanItem[] = days.map((d) => ({ day: d.day, videoId: clips[d.i].video.dbId!, title: d.title, hook: d.hook, format: d.format, why: d.why }));
  const { error } = await supabase
    .from("content_plans")
    .upsert({ product_id: productId, start_day: bangkokDay(), items, updated_at: new Date().toISOString() }, { onConflict: "user_id,product_id" });
  return error ? { ok: false, error: "failed" } : { ok: true };
}
