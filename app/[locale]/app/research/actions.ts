"use server";

import { z } from "zod";
import type { Platform } from "@/lib/adapters/types";
import { MAX_KEYWORDS } from "@/lib/ai/schemas";
import { suggestPlan, summarizeRun } from "@/lib/ai/tasks";
import { searchKeywords } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const briefSchema = z.string().trim().min(10).max(1000);

export async function suggestPlanAction(brief: string) {
  const parsed = briefSchema.safeParse(brief);
  if (!parsed.success) return { ok: false as const, error: "brief" };
  const plan = await suggestPlan(parsed.data);
  return { ok: true as const, plan };
}

const runSchema = z.object({
  brief: briefSchema,
  keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(MAX_KEYWORDS),
  exclusions: z.array(z.string().trim().min(1).max(40)).max(10),
  platforms: z.array(z.enum(["tiktok", "youtube"])).min(1),
  locale: z.enum(["th", "en"]),
});

export type RunInput = z.infer<typeof runSchema>;

/** Creates a research run, searches, saves ranked results and the AI insight card. Returns the run id. */
export async function runResearchAction(input: RunInput) {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { brief, keywords, exclusions, platforms, locale } = parsed.data;

  const supabase = await createClient();
  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({ brief, keywords, exclusions, platforms, status: "running" })
    .select("id")
    .single();
  if (runError || !run) return { ok: false as const, error: "save" };

  try {
    const result = await searchKeywords(keywords, platforms as Platform[], exclusions);
    const rows = result.videos
      .filter((v) => v.dbId !== undefined)
      .map((v, i) => ({
        run_id: run.id,
        video_id: v.dbId!,
        keyword: v.keyword,
        reach_score: v.reach,
        usual_score: v.usual,
        usual_views: v.usualViews === null ? null : Math.round(v.usualViews),
        label: v.label,
        rank: i + 1,
      }));
    if (rows.length) {
      const { error } = await supabase.from("run_results").insert(rows);
      if (error) throw new Error(error.message);
    }

    const top = result.videos.slice(0, 10);
    const summary = await summarizeRun(
      {
        keywords,
        totalVideos: result.videos.length,
        topViews: result.videos.reduce<number | null>((m, v) => Math.max(m ?? 0, v.views ?? 0), null),
        smallAccountsInTop10: top.filter((v) => (v.creatorFollowers ?? Infinity) < 10_000).length,
        breakouts: result.videos.filter((v) => v.label === "breakout").length,
        top: top.map((v) => ({
          handle: v.creatorHandle,
          caption: v.caption,
          views: v.views,
          multiplier: v.usual ?? v.reach,
          platform: v.platform,
        })),
      },
      locale,
    );

    await supabase
      .from("research_runs")
      .update({
        status: "done",
        summary,
        error: result.errors.length ? result.errors.join("\n").slice(0, 2000) : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { ok: true as const, runId: run.id as string };
  } catch (e) {
    await supabase
      .from("research_runs")
      .update({ status: "failed", error: (e as Error).message.slice(0, 2000), finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return { ok: false as const, error: "search", runId: run.id as string };
  }
}
