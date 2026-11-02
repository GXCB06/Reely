import "server-only";
import { type ResultRow, videoFromResultRow } from "@/lib/db-mappers";
import { bestOrder } from "@/lib/ranking";
import { type EvalClip, type EvalPlatform, EVAL_PLATFORMS, effectiveLabels, humanLabels, type Label, type LabelRow, type RunStatsLite } from "@/lib/eval";
import { loadFeedback } from "@/lib/feedback-store";
import { type Goal, isGoal } from "@/lib/goals";
import type { ScoredVideo } from "@/lib/search";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type EvalRun = {
  id: string;
  title: string;
  brief: string;
  region: string;
  platforms: string[];
  goal: Goal | null;
  product: { name: string; whatItIs: string; audience: string };
  createdAt: string;
  seconds: number | null;
  stats: RunStatsLite;
};

/**
 * One test brief as the results page ranks it: clips in "best" order (goal-aware, with the product's 👍/👎), the same
 * order the platform tabs show. Read with the service role, so only call it after an owner check.
 */
export async function loadEvalBrief(admin: Admin, runId: string) {
  const [{ data: run }, { data: rows }, { data: labelRows }] = await Promise.all([
    admin
      .from("research_runs")
      .select("id, title, brief, region, platforms, goal, input, stats, product_id, created_at, finished_at")
      .eq("id", runId)
      .maybeSingle(),
    admin
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, copyable, creator_fit, account_type, creator_why, relevance, videos(*)")
      .eq("run_id", runId)
      .order("rank"),
    admin.from("relevance_labels").select("item, source, label, reason").eq("run_id", runId),
  ]);
  if (!run) return null;
  const goal = isGoal(run.goal) ? (run.goal as Goal) : null;
  const { feedback } = await loadFeedback(admin as never, run.product_id as string | null);
  const score = bestOrder(goal, feedback);
  const videos = ((rows ?? []) as unknown as ResultRow[])
    .map(videoFromResultRow)
    .filter((v): v is ScoredVideo => v !== null && !!v.dbId && (EVAL_PLATFORMS as readonly string[]).includes(v.platform))
    .sort((a, b) => score(b) - score(a));
  const input = (run.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string };
  const finished = run.finished_at ? new Date(run.finished_at as string).getTime() : null;
  const evalRun: EvalRun = {
    id: run.id as string,
    title: ((run.title as string | null) || input.productName || (run.brief as string)).slice(0, 80),
    brief: run.brief as string,
    region: (run.region as string | null) ?? "th",
    platforms: (run.platforms as string[]) ?? [],
    goal,
    product: { name: input.productName ?? "", whatItIs: input.whatItIs ?? "", audience: input.audience ?? "" },
    createdAt: run.created_at as string,
    seconds: finished ? Math.round((finished - new Date(run.created_at as string).getTime()) / 1000) : null,
    stats: (run.stats ?? null) as RunStatsLite,
  };
  const clips: EvalClip[] = videos.map((v) => ({ id: v.dbId!, platform: v.platform as EvalPlatform, handle: v.creatorHandle }));
  const rowsTyped = (labelRows ?? []) as (LabelRow & { reason: string | null })[];
  const reasons = new Map(rowsTyped.filter((r) => r.source === "ai").map((r) => [r.item, r.reason ?? ""]));
  const corrected = new Set(rowsTyped.filter((r) => r.source === "user").map((r) => r.item));
  return {
    run: evalRun,
    videos,
    clips,
    labels: effectiveLabels(rowsTyped),
    /** Only the owner's labels: the human-labelled test set. */
    userLabels: humanLabels(rowsTyped),
    reasons,
    corrected,
    feedback,
    productId: run.product_id as string | null,
  };
}

export type EvalBrief = NonNullable<Awaited<ReturnType<typeof loadEvalBrief>>>;
export type { Label };

const PAGE = 1000;

/**
 * Every clip label of the given researches. The database answers at most 1,000 rows a request, and the test set has
 * more labels than that (AI labels plus the owner's, saved on each research of a brief), so this reads in pages.
 */
export async function clipLabelRows<T>(admin: Admin, runIds: string[], columns: string, only: { source?: "ai" | "user"; blind?: boolean } = {}): Promise<T[]> {
  if (!runIds.length) return [];
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from("relevance_labels").select(columns).eq("kind", "clip").in("run_id", runIds);
    if (only.source) q = q.eq("source", only.source);
    if (only.blind !== undefined) q = q.eq("blind", only.blind);
    const { data, error } = await q.order("run_id").order("item").order("source").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}
