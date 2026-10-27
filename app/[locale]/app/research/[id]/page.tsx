import { CalendarDays, ChevronDown, ChevronUp, Eye, Globe, Layers, PenLine, Radar, RotateCcw, Sparkles, Target, ThumbsUp } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ReelyBubble, UserBubble } from "@/components/chat/research-chat";
import { RegionIcon } from "@/components/chat/region-flag";
import { OutlierCard } from "@/components/outlier-card";
import { PlatformIcon } from "@/components/platform-icon";
import { FilterBar } from "@/components/results/filter-bar";
import { FollowTopicButton } from "@/components/results/follow-topic-button";
import { IdeasLoader } from "@/components/results/ideas-loader";
import { InsightCard } from "@/components/results/insight-card";
import { Patterns } from "@/components/results/patterns";
import { RecheckBanner } from "@/components/results/recheck-banner";
import { RefreshRunButton } from "@/components/results/refresh-run-button";
import { ScoreExplainer } from "@/components/results/score-explainer";
import { Link } from "@/i18n/navigation";
import type { RunSummary } from "@/lib/ai/schemas";
import { type ResultRow, videoFromResultRow } from "@/lib/db-mappers";
import { applyFilters, diverseTop, parseFilters, type PlatformTab } from "@/lib/results";
import { withFeedback } from "@/lib/feedback";
import { loadFeedback } from "@/lib/feedback-store";
import { isGoal, scoreFor } from "@/lib/goals";
import type { RegionChoice } from "@/lib/region";
import { runTotals } from "@/lib/run-stats";
import type { DropReason, PlatformStats, ScoredVideo, SimilarAccount } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

/** Matches the server action: a research can pull in new videos about once a day. */
const REFRESH_COOLDOWN_MS = 20 * 3600e3;
const olderThan = (iso: string, ms: number) => Date.now() - new Date(iso).getTime() > ms;

/** Searches run as server actions on this page and can take 30-60 s (Vercel's default limit is lower). */
export const maxDuration = 120;

/** A creator's profile on their platform (YouTube handles without a custom URL are channel ids). */
function profileUrl(a: SimilarAccount) {
  if (a.platform === "tiktok") return `https://www.tiktok.com/@${a.handle}`;
  if (a.platform === "instagram") return `https://www.instagram.com/${a.handle}/`;
  return /^UC[\w-]{22}$/.test(a.handle) ? `https://www.youtube.com/channel/${a.handle}` : `https://www.youtube.com/@${a.handle}`;
}

export default async function ResearchResultsPage({ params, searchParams }: PageProps<"/[locale]/app/research/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("results");
  const tc = await getTranslations("chat");
  const tg = await getTranslations("goals");
  const format = await getFormatter();
  const supabase = await createClient();

  // One round trip: the run, its results and the saved list are fetched together.
  const [{ data: run }, { data: rows }, { data: savedRows }] = await Promise.all([
    supabase
      .from("research_runs")
      .select("id, brief, keywords, keyword_regions, exclusions, platforms, region, input, status, error, summary, stats, followed_at, settings, last_refreshed_at, product_id, goal, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("run_results")
      .select("keyword, reach_score, usual_score, usual_views, label, copyable, added_at, videos(*)")
      .eq("run_id", id)
      .order("rank"),
    supabase.from("saved_videos").select("video_id"),
  ]);
  if (!run) notFound();
  // The product's 👍/👎: shown on each clip and used to order them.
  const { feedback, votes } = await loadFeedback(supabase, run.product_id as string | null);
  const saved = new Set((savedRows ?? []).map((r) => r.video_id as number));
  const all = ((rows ?? []) as unknown as ResultRow[]).map(videoFromResultRow).filter((v): v is ScoredVideo => v !== null);

  // Videos added by "update with new videos" (well after the research was created) are marked new.
  // "Best" = best for what the user wants the clips for (plain best on researches made before goals).
  const goal = isGoal(run.goal) ? run.goal : null;
  const score = withFeedback<ScoredVideo>(scoreFor(goal), feedback);
  const feedbackFor = (v: ScoredVideo) =>
    run.product_id && v.dbId ? { productId: run.product_id as string, vote: votes.get(v.dbId) ?? null } : undefined;
  const createdAt = new Date(run.created_at as string).getTime();
  const newIds = new Set(
    ((rows ?? []) as unknown as { added_at: string | null; videos: { id: number } | null }[])
      .filter((r) => r.videos && r.added_at && new Date(r.added_at).getTime() - createdAt > 10 * 60_000)
      .map((r) => r.videos!.id),
  );
  const fresh = all.filter((v) => v.dbId && newIds.has(v.dbId)).sort((a, b) => score(b) - score(a));
  const settings = run.settings as { days?: number; minViews?: number } | null;
  const canRefresh = run.status !== "running" && olderThan((run.last_refreshed_at as string | null) ?? (run.created_at as string), REFRESH_COOLDOWN_MS);

  const filters = parseFilters(sp);
  // Default view: the 10 best. "Show all" (?all=1) opens every result with filters and sorting.
  const showAll = sp.all === "1";
  const shown = applyFilters(all, filters, undefined, score);
  const top = diverseTop(all, 10, 2, score);
  const summary = run.summary as RunSummary | null;
  const ideaOf = new Map((summary?.ideas ?? []).map((x) => [x.videoId, x.idea]));
  const stats = run.stats as {
    hidden?: number;
    offTopic?: number;
    platforms?: Partial<Record<"tiktok" | "youtube" | "instagram", PlatformStats>>;
    feedback?: { liked: number; disliked: number };
    relevanceFailed?: boolean;
    similarAccounts?: SimilarAccount[];
  } | null;
  // Similar products' own accounts (an app or brand like the user's, promoting itself) and their best clips.
  const similarKeys = new Set((stats?.similarAccounts ?? []).map((a) => `${a.platform}:${a.handle}`));
  // At most 2 per account, so one account's near-identical posts don't fill the section.
  const similarClips = diverseTop(all.filter((v) => similarKeys.has(`${v.platform}:${v.creatorHandle}`)), 8, 0, score);
  // The main reason each platform's videos were dropped, so a thin platform is explained, not hidden.
  const mainDrop = (s: PlatformStats) =>
    (Object.entries(s.dropped) as [DropReason, number][]).sort((a, b) => b[1] - a[1])[0] ?? null;
  const counts: Record<PlatformTab, number> = {
    all: all.length,
    tiktok: all.filter((v) => v.platform === "tiktok").length,
    youtube: all.filter((v) => v.platform === "youtube").length,
    instagram: all.filter((v) => v.platform === "instagram").length,
  };
  const input = run.input as { text?: string; url?: string | null; imageThumb?: string | null; reply?: string; productName?: string } | null;
  const region = (run.region as RegionChoice | null) ?? "th";
  const keywordRegions = (run.keyword_regions as ("th" | "global")[] | null) ?? [];
  const lead = top[0];
  const again = (r: RegionChoice) =>
    `/app?${new URLSearchParams({ q: [input?.text, input?.url].filter(Boolean).join(" ") || run.brief, region: r, go: "1" })}`;
  const flatParams = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  return (
    <div>
      <div className="mx-auto max-w-3xl space-y-6 px-6 pt-8 pb-6">
        <UserBubble
          text={input?.text ?? run.brief}
          link={input?.url ?? null}
          thumb={input?.imageThumb ?? null}
          productName={run.product_id ? (input?.productName ?? null) : null}
        />
        <ReelyBubble>
          {input?.reply && <p className="mb-3 leading-relaxed">{input.reply}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {(run.keywords as string[]).map((k, i) => (
              <span key={k} className="chip chip-on pointer-events-none">
                <RegionIcon region={keywordRegions[i] ?? region} /> {k}
              </span>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {(run.platforms as ("tiktok" | "youtube" | "instagram")[]).map((p) => (
              <span key={p} className="inline-flex items-center gap-1">
                <PlatformIcon platform={p} className="size-3.5" /> {tc(`platform.${p}`)} ·
              </span>
            ))}{" "}
            {goal && (
              <span className="inline-flex items-center gap-1">
                <Target className="size-3.5" /> {tg(`${goal}.short`)} ·
              </span>
            )}{" "}
            <RegionIcon region={region} /> {tc(`region.${region}`)} ·{" "}
            {settings?.days && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" /> {tc("windowDays", { n: settings.days })} ·
              </span>
            )}
            {settings?.minViews ? (
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" /> {tc("minViewsN", { n: settings.minViews / 1000 })} ·
              </span>
            ) : null}
            {format.dateTime(new Date(run.created_at), { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <RefreshRunButton runId={run.id as string} canRefresh={canRefresh} />
            <span className="text-xs text-muted-foreground">
              {run.last_refreshed_at
                ? t("refreshedAt", { when: format.relativeTime(new Date(run.last_refreshed_at as string)) })
                : t("refreshExplain")}
            </span>
          </div>
        </ReelyBubble>
      </div>

      <div className="space-y-8 px-4 md:px-10 pb-16">
        {run.status === "failed" && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t("failed")}</p>}
        {run.status === "done" && stats?.relevanceFailed && <RecheckBanner runId={run.id as string} />}

        <InsightCard
          summary={summary}
          totals={runTotals(all)}
          smallInTop10={top.filter((v) => (v.creatorFollowers ?? Infinity) < 10_000).length}
          topCount={top.length}
          tagHref={(tag) => `/app/research/${id}?${new URLSearchParams({ all: "1", tag })}`}
        />

        {stats && (stats.offTopic ?? 0) + (stats.hidden ?? 0) > 0 && (
          <div className="-mt-4 space-y-1.5 px-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              {t("statsLine", { offTopic: stats.offTopic ?? 0, hidden: stats.hidden ?? 0 })}
            </p>
            {stats.feedback && (
              <p className="flex items-center gap-1.5 text-primary">
                <ThumbsUp className="size-3.5" /> {t("learnedFrom", { liked: stats.feedback.liked, disliked: stats.feedback.disliked })}
              </p>
            )}
            {stats.platforms && (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {(Object.entries(stats.platforms) as ["tiktok" | "youtube" | "instagram", PlatformStats][]).map(([p, s]) => {
                  const drop = mainDrop(s);
                  return (
                    <span key={p} className="inline-flex items-center gap-1.5">
                      <PlatformIcon platform={p} className="size-3.5" />
                      {t("platformKept", { kept: s.kept, found: s.found })}
                      {drop && s.kept < s.found && (
                        <span className="text-muted-foreground/80">· {t("mostlyDropped", { reason: t(`dropReason.${drop[0]}`), n: drop[1] })}</span>
                      )}
                      {!!s.fromFeeds && <span className="text-primary">· {t("fromFeeds", { n: s.fromFeeds })}</span>}
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        )}

        {fresh.length > 0 && !showAll && (
          <section className="space-y-4 rounded-3xl border-2 border-primary/30 bg-primary/5 p-5">
            <h3 className="font-heading text-lg font-bold">{t("freshTitle", { n: fresh.length })}</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {fresh.slice(0, 10).map((v) => (
                <OutlierCard key={`${v.platform}:${v.platformVideoId}`} video={v} saved={v.dbId ? saved.has(v.dbId) : false} isNew feedback={feedbackFor(v)} />
              ))}
            </div>
          </section>
        )}


        {showAll ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading text-lg font-bold">{t("allVideos")}</h3>
              <Link href={`/app/research/${id}`} scroll={false} className="inline-flex items-center gap-1 text-sm text-primary">
                <ChevronUp className="size-4" /> {t("showTop")}
              </Link>
            </div>
            <FilterBar basePath={`/app/research/${id}`} filters={filters} params={flatParams} counts={counts} />
            <ScoreExplainer />
            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {shown.map((v) => (
                  <OutlierCard
                    key={`${v.platform}:${v.platformVideoId}`}
                    video={v}
                    saved={v.dbId ? saved.has(v.dbId) : false}
                    isNew={!!v.dbId && newIds.has(v.dbId)}
                    idea={v.dbId ? ideaOf.get(v.dbId) : null}
                    feedback={feedbackFor(v)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          top.length > 0 && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-heading text-lg font-bold">{t("bestTitle", { n: top.length })}</h3>
                <span className="text-xs text-muted-foreground">{t("bestHint")}</span>
              </div>
              {run.product_id && <p className="-mt-2 text-xs text-muted-foreground">{t("teachHint", { product: input?.productName ?? "" })}</p>}
              {/* Ideas are written once the results are on screen; older researches without a goal have none. */}
              {run.status === "done" && goal && input?.productName && summary && !summary.ideas?.length && (
                <IdeasLoader runId={run.id as string} />
              )}
              <ScoreExplainer />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {top.map((v) => (
                  <OutlierCard
                    key={`${v.platform}:${v.platformVideoId}`}
                    video={v}
                    saved={v.dbId ? saved.has(v.dbId) : false}
                    isNew={!!v.dbId && newIds.has(v.dbId)}
                    idea={v.dbId ? ideaOf.get(v.dbId) : null}
                    feedback={feedbackFor(v)}
                  />
                ))}
              </div>
              {all.length > top.length && (
                <div className="text-center">
                  <Link href={`/app/research/${id}?all=1`} scroll={false} className="chip">
                    <ChevronDown className="size-3.5" /> {t("showAll", { n: all.length })}
                  </Link>
                </div>
              )}
            </section>
          )
        )}

        {!showAll && similarClips.length > 0 && (
          <section className="space-y-4">
            <div>
              <h3 className="font-heading text-lg font-bold">{t("similarTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("similarHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats!.similarAccounts!.map((a) => (
                <a key={`${a.platform}:${a.handle}`} href={profileUrl(a)} target="_blank" rel="noreferrer" className="chip">
                  <PlatformIcon platform={a.platform} className="size-3.5" /> @{a.handle}
                  {a.usualViews !== null && (
                    <span className="text-muted-foreground">
                      · {t("similarUsual", { views: format.number(a.usualViews, { notation: "compact", maximumFractionDigits: 1 }) })}
                    </span>
                  )}
                </a>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {similarClips.map((v) => (
                <OutlierCard
                  key={`${v.platform}:${v.platformVideoId}`}
                  video={v}
                  saved={v.dbId ? saved.has(v.dbId) : false}
                  idea={v.dbId ? ideaOf.get(v.dbId) : null}
                  feedback={feedbackFor(v)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Formulas come after the clips they are drawn from (users looked for the videos first). */}
        {!showAll && summary?.patterns && summary.patterns.length > 0 && (
          <Patterns patterns={summary.patterns} videos={all} productName={input?.productName ?? null} />
        )}

        {run.status !== "running" && (
          <section className="mx-auto max-w-3xl">
            <ReelyBubble>
              <p className="mb-3 text-sm font-semibold">{t("nextTitle")}</p>
              <div className="flex flex-wrap gap-2">
                <FollowTopicButton runId={run.id as string} initialFollowed={run.followed_at !== null} />
                {lead?.dbId && (
                  <Link href={`/app/video/${lead.dbId}`} className="chip">
                    <PenLine className="size-3.5" /> {t("nextScript", { handle: lead.creatorHandle })}
                  </Link>
                )}
                {lead?.dbId && (
                  <Link href={`/app/format/${lead.dbId}`} className="chip">
                    <Layers className="size-3.5" /> {t("nextFormat")}
                  </Link>
                )}
                {lead && lead.platform !== "instagram" && lead.dbId && (
                  <Link href={`/app/video/${lead.dbId}`} className="chip">
                    <Radar className="size-3.5" /> {t("nextTrack", { handle: lead.creatorHandle })}
                  </Link>
                )}
                {region !== "global" && (
                  <Link href={again("global")} className="chip">
                    <Globe className="size-3.5" /> {t("nextWorldwide")}
                  </Link>
                )}
                {region !== "th" && (
                  <Link href={again("th")} className="chip">
                    <RegionIcon region="th" /> {t("nextThailand")}
                  </Link>
                )}
                <Link href={`/app?${new URLSearchParams({ q: input?.text || run.brief })}`} className="chip">
                  <RotateCcw className="size-3.5" /> {t("nextEdit")}
                </Link>
              </div>
            </ReelyBubble>
          </section>
        )}
      </div>
    </div>
  );
}
