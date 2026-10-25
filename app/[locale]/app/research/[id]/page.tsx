import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { FilterBar } from "@/components/results/filter-bar";
import { InsightCard } from "@/components/results/insight-card";
import { Link } from "@/i18n/navigation";
import type { RunSummary } from "@/lib/ai/schemas";
import { type ResultRow, videoFromResultRow } from "@/lib/db-mappers";
import { applyFilters, outlierOf, parseFilters, type PlatformTab } from "@/lib/results";
import type { ScoredVideo } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

export default async function ResearchResultsPage({ params, searchParams }: PageProps<"/[locale]/app/research/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("results");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("research_runs")
    .select("id, brief, keywords, exclusions, platforms, status, error, summary, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!run) notFound();

  const [{ data: rows }, { data: savedRows }] = await Promise.all([
    supabase
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, videos(*)")
      .eq("run_id", id)
      .order("rank"),
    supabase.from("saved_videos").select("video_id"),
  ]);
  const saved = new Set((savedRows ?? []).map((r) => r.video_id as number));
  const all = ((rows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null);

  const filters = parseFilters(sp);
  const shown = applyFilters(all, filters);
  const top = [...all].sort((a, b) => outlierOf(b) - outlierOf(a)).slice(0, 10);
  const counts: Record<PlatformTab, number> = {
    all: all.length,
    tiktok: all.filter((v) => v.platform === "tiktok").length,
    youtube: all.filter((v) => v.platform === "youtube").length,
    instagram: 0,
  };
  const flatParams = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  return (
    <div>
      <header className="page-wash px-10 pt-8 pb-6">
        <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("back")}
        </Link>
        <p className="mt-4 max-w-3xl text-lg font-medium">{run.brief}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(run.keywords as string[]).map((k) => (
            <span key={k} className="chip chip-on pointer-events-none">
              {k}
            </span>
          ))}
          <span className="text-xs text-muted-foreground">
            {format.dateTime(new Date(run.created_at), { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>
      </header>

      <div className="space-y-8 px-10 pb-16">
        {run.status === "failed" && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t("failed")}</p>}

        <InsightCard
          summary={run.summary as RunSummary | null}
          totalVideos={all.length}
          topViews={all.reduce<number | null>((m, v) => Math.max(m ?? 0, v.views ?? 0), null)}
          smallInTop10={top.filter((v) => (v.creatorFollowers ?? Infinity) < 10_000).length}
          topCount={top.length}
        />

        {top.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-heading text-lg font-bold">{t("topVideos")}</h3>
              <span className="text-xs text-muted-foreground">{t("topVideosHint")}</span>
            </div>
            <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3">
              {top.map((v) => (
                <div key={`${v.platform}:${v.platformVideoId}`} className="w-52 shrink-0 snap-start">
                  <OutlierCard video={v} variant="carousel" saved={v.dbId ? saved.has(v.dbId) : false} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h3 className="font-heading text-lg font-bold">{t("allVideos")}</h3>
          <FilterBar basePath={`/app/research/${id}`} filters={filters} params={flatParams} counts={counts} />
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((v) => (
                <OutlierCard key={`${v.platform}:${v.platformVideoId}`} video={v} saved={v.dbId ? saved.has(v.dbId) : false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
