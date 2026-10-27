import "server-only";
import type { HookBreakdown, RunSummary } from "@/lib/ai/schemas";
import { type ResultRow, videoFromResultRow } from "@/lib/db-mappers";
import type { ExportClip, ExportData } from "@/lib/export";
import { withFeedback } from "@/lib/feedback";
import { loadFeedback } from "@/lib/feedback-store";
import { isGoal, scoreFor } from "@/lib/goals";
import { diverseTop } from "@/lib/results";
import { engagementRate } from "@/lib/scoring";
import type { ScoredVideo, SimilarAccount } from "@/lib/search";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * One research as export data, in the order the results page uses ("best for your goal", nudged by 👍/👎).
 * `scope`: the top 10 the page shows first, or every clip. Null when the research isn't the user's (RLS).
 */
export async function researchExport(supabase: Supabase, id: string, scope: "top" | "all", lang: "th" | "en"): Promise<ExportData | null> {
  const [{ data: run }, { data: rows }] = await Promise.all([
    supabase
      .from("research_runs")
      .select("id, title, brief, keywords, platforms, region, input, summary, stats, settings, product_id, goal, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, copyable, videos(*)")
      .eq("run_id", id)
      .order("rank"),
  ]);
  if (!run) return null;
  const goal = isGoal(run.goal) ? run.goal : null;
  const { feedback } = await loadFeedback(supabase, run.product_id as string | null);
  const score = withFeedback<ScoredVideo>(scoreFor(goal), feedback);
  const all = ((rows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null);
  const clips = scope === "top" ? diverseTop(all, 10, 2, score) : [...all].sort((a, b) => score(b) - score(a));

  const summary = run.summary as RunSummary | null;
  const ideaOf = new Map((summary?.ideas ?? []).map((x) => [x.videoId, x.idea]));
  const similar = new Set(((run.stats as { similarAccounts?: SimilarAccount[] } | null)?.similarAccounts ?? []).map((a) => `${a.platform}:${a.handle}`));
  const ids = clips.map((v) => v.dbId).filter((x): x is number => x !== undefined);
  const { data: transcripts } = ids.length
    ? await supabase.from("video_transcripts").select("video_id, breakdowns").in("video_id", ids)
    : { data: [] };
  const hookOf = new Map(
    (transcripts ?? []).map((t) => {
      const b = (t.breakdowns ?? {}) as Record<string, HookBreakdown>;
      return [t.video_id as number, (b[lang] ?? Object.values(b)[0])?.hook ?? null];
    }),
  );
  const handleOf = new Map(all.map((v) => [v.dbId, `@${v.creatorHandle}`]));
  const input = (run.input ?? {}) as { productName?: string; whatItIs?: string; audience?: string; competitors?: string[] };

  return {
    title: (run.title as string | null) ?? input.productName ?? "",
    brief: run.brief as string,
    product: input.productName
      ? { name: input.productName, whatItIs: input.whatItIs ?? "", audience: input.audience ?? "", competitors: input.competitors ?? [] }
      : null,
    goal,
    keywords: (run.keywords as string[]) ?? [],
    platforms: (run.platforms as string[]) ?? [],
    region: (run.region as string | null) ?? "th",
    settings: (run.settings as { days?: number; minViews?: number } | null) ?? {},
    createdAt: run.created_at as string,
    summary: summary ? { headline: summary.headline, takeaway: summary.takeaway } : null,
    formulas: (summary?.patterns ?? []).map((p) => ({
      name: p.name,
      why: p.why,
      hook: p.hook,
      idea: p.idea,
      examples: p.videoIds.map((x) => handleOf.get(x)).filter((h): h is string => !!h),
    })),
    clips: clips.map(
      (v, i): ExportClip => ({
        rank: i + 1,
        platform: v.platform,
        handle: v.creatorHandle,
        url: v.url,
        caption: v.caption,
        views: v.views,
        usualViews: v.usualViews,
        multiplier: v.usual ?? v.reach,
        label: v.label,
        likes: v.likes,
        comments: v.comments,
        saves: v.saves,
        shares: v.shares,
        engagement: engagementRate(v),
        followers: v.creatorFollowers,
        postedAt: v.publishedAt,
        durationSeconds: v.durationSeconds,
        keyword: v.keyword,
        spokenHook: (v.dbId && hookOf.get(v.dbId)) || null,
        idea: (v.dbId && ideaOf.get(v.dbId)) || null,
        similarProduct: similar.has(`${v.platform}:${v.creatorHandle}`),
      }),
    ),
  };
}
