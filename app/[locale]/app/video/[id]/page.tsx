import { ArrowLeft, ExternalLink, Flame, Search } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { OutlierCard } from "@/components/outlier-card";
import { SaveButton } from "@/components/save-button";
import { ClipPlayer } from "@/components/clip-player";
import { TrackButton } from "@/components/tracking/track-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { modelName } from "@/lib/ai/model";
import { isGoal } from "@/lib/goals";
import { analyzeVideo } from "@/lib/ai/tasks";
import type { VideoRow } from "@/lib/db-mappers";
import { formatMultiplier, labelFor, reachScore, usualScore } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadAccount } from "@/lib/tracking";
import type { SavedScript } from "./actions";
import type { HookBreakdown } from "@/lib/ai/schemas";
import type { Segment } from "@/lib/transcript";
import { HookPanel } from "./hook-panel";
import { ScriptPanel } from "./script-panel";
import { UsualViewsLoader } from "./usual-views-loader";

type Scores = { usual: number | null; reach: number | null };

/** AI breakdown, cached per video in video_analyses (shared by all users). */
async function Breakdown({ video, scores, locale }: { video: VideoRow; scores: Scores; locale: string }) {
  const t = await getTranslations("video");
  const supabase = await createClient();
  const { data: cached } = await supabase.from("video_analyses").select("*").eq("video_id", video.id).maybeSingle();

  let a = cached && cached.locale === locale ? cached : null;
  let sample = false;
  if (!a) {
    const result = await analyzeVideo(
      { caption: video.caption, views: video.views, usual: scores.usual, reach: scores.reach, handle: video.creator_handle, platform: video.platform },
      locale,
    );
    sample = result.source === "sample";
    a = {
      hook: result.hook,
      hook_type: result.hookType,
      format: result.format,
      angle: result.angle,
      cta: result.cta,
      why_it_worked: result.whyItWorked,
    };
    // Only real AI output is cached; sample text would block a real analysis later.
    if (!sample) {
      await createAdminClient()
        ?.from("video_analyses")
        .upsert({ video_id: video.id, locale, model: modelName(), ...a });
    }
  }

  const rows = [
    { label: t("hook"), value: a.hook, accent: true },
    { label: t("hookType"), value: a.hook_type },
    { label: t("format"), value: a.format },
    { label: t("angle"), value: a.angle },
    { label: t("cta"), value: a.cta },
  ];
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className={`rounded-2xl bg-muted p-4 ${r.accent ? "sm:col-span-2" : ""}`}>
            <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{r.label}</dt>
            <dd className={`mt-1 ${r.accent ? "text-lg font-semibold" : ""}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-2xl border p-4">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("whyItWorked")}</p>
        <p className="mt-1 leading-relaxed">{a.why_it_worked}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("hypothesisNote")}</p>
      </div>
      {sample && <p className="text-xs text-muted-foreground">{t("sampleNote")}</p>}
    </div>
  );
}

/** "More hits from @creator": their other posts that beat their usual views, from the shared cache (no credits). */
async function CreatorHits({ video }: { video: VideoRow }) {
  const t = await getTranslations("video");
  const account = await loadAccount(video.platform, video.creator_handle);
  const hits = account.videos.filter((v) => v.dbId !== video.id && (v.usual ?? 0) >= 2).slice(0, 4);
  if (!hits.length) return null;
  return (
    <section>
      <h2 className="font-heading text-xl font-bold">{t("creatorHits", { handle: video.creator_handle })}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("creatorHitsHint")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {hits.map((v) => (
          <OutlierCard key={v.platformVideoId} video={v} />
        ))}
      </div>
    </section>
  );
}

/** "Find more like this": the chat, pre-filled with what the clip is about, on the clip's platform. */
function moreLikeThisHref(video: VideoRow, query: (caption: string) => string, productId: string | null) {
  const words = video.caption.replace(/https?:\/\/\S+|[#@][\p{L}\p{N}_.]+/gu, " ").replace(/\s+/g, " ").trim();
  const tags = video.caption.match(/#[\p{L}\p{N}_]+/gu)?.slice(0, 5).join(" ") ?? "";
  const about = (words || tags || `@${video.creator_handle}`).slice(0, 160);
  const params = new URLSearchParams({ q: query(about), p: video.platform === "instagram" ? "instagram" : "tiktok,youtube" });
  if (productId) params.set("product", productId);
  return `/app?${params}`;
}

export default async function VideoPage({ params, searchParams }: PageProps<"/[locale]/app/video/[id]">) {
  const { locale, id } = await params;
  const { product: productParam, lookup } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("video");
  const ts = await getTranslations("search");
  const format = await getFormatter();
  const supabase = await createClient();

  const videoId = Number(id);
  if (!Number.isInteger(videoId)) notFound();
  const { data: video } = await supabase.from("videos").select("*").eq("id", videoId).maybeSingle<VideoRow>();
  if (!video) notFound();

  const [{ data: creator }, { data: savedRow }, { data: product }, { data: scripts }, { data: trackedRow }, { data: transcript }] = await Promise.all([
    supabase.from("creators").select("usual_views").eq("platform", video.platform).eq("handle", video.creator_handle).maybeSingle(),
    supabase.from("saved_videos").select("video_id").eq("video_id", videoId).maybeSingle(),
    supabase.from("products").select("id, name, goal").order("created_at"),
    supabase.from("scripts").select("id, content, created_at").eq("video_id", videoId).order("created_at", { ascending: false }),
    supabase.from("tracked_accounts").select("id").eq("platform", video.platform).eq("handle", video.creator_handle).maybeSingle(),
    supabase.from("video_transcripts").select("status, segments, breakdowns").eq("video_id", videoId).maybeSingle(),
  ]);
  // The real hook, when anyone has read this clip's transcript before (shared, so it shows at once).
  const hookInitial =
    transcript?.status === "none"
      ? ("none" as const)
      : transcript
        ? {
            segments: transcript.segments as Segment[],
            breakdown: ((transcript.breakdowns ?? {}) as Record<string, HookBreakdown>)[locale] ?? null,
          }
        : null;
  const usualViews = (creator?.usual_views as number | null) ?? null;
  const scores = { usual: usualScore(video.views, usualViews), reach: reachScore(video.views, video.creator_followers) };
  const label = labelFor(scores.usual, scores.reach, { views: video.views, followers: video.creator_followers });
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });

  const stats = [
    { label: ts("views"), value: video.views },
    { label: t("likes"), value: video.likes },
    { label: t("comments"), value: video.comments },
    { label: t("saves"), value: video.saves },
    { label: t("shares"), value: video.shares },
    { label: ts("followers"), value: video.creator_followers },
  ];

  return (
    <div className="px-4 md:px-10 py-8">
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          {/* On a phone the cover would fill the whole first screen; keep it small there. */}
          <div className="mx-auto w-full max-w-60 overflow-hidden rounded-2xl border bg-muted lg:max-w-none">
            <div className="aspect-[9/14] w-full">
              {/* Plays here with sound; "Open original" is only needed for comments and the creator's profile. */}
              <ClipPlayer platform={video.platform} platformVideoId={video.platform_video_id} thumbnailUrl={video.thumbnail_url} videoId={video.id} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("openOriginal")} <ExternalLink className="size-3.5" />
            </a>
            <SaveButton videoId={video.id} initialSaved={Boolean(savedRow)} />
          </div>
          <TrackButton platform={video.platform} handle={video.creator_handle} initialTracked={Boolean(trackedRow)} />
          <Link
            href={moreLikeThisHref(video, (caption) => t("moreLikeThisQuery", { caption }), typeof productParam === "string" ? productParam : null)}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Search className="size-4" /> {t("moreLikeThis")}
          </Link>
        </aside>

        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">
              @{video.creator_handle}
              {video.published_at && <> · {format.dateTime(new Date(video.published_at), { dateStyle: "medium" })}</>}
            </p>
            <p className="mt-2 text-lg leading-relaxed whitespace-pre-line">{video.caption || "—"}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* A pasted link: the creator's usual views arrive a few seconds after the page. */}
            {lookup === "1" && usualViews === null && video.platform !== "youtube" && (
              <UsualViewsLoader videoId={video.id} handle={video.creator_handle} />
            )}
            {(scores.usual ?? scores.reach) !== null && (
              <div className="rounded-2xl bg-primary px-5 py-3 text-primary-foreground">
                <p className="flex items-center gap-1 text-2xl font-bold">
                  <Flame className="size-5" /> {formatMultiplier((scores.usual ?? scores.reach)!)}×
                </p>
                <p className="text-xs opacity-80">
                  {scores.usual !== null && usualViews !== null
                    ? ts("usually", { views: compact(usualViews) })
                    : ts("reach", { x: formatMultiplier(scores.reach!) })}
                  {" · "}
                  {(await getTranslations("labels"))(label)}
                </p>
              </div>
            )}
            {stats
              .filter((s) => s.value !== null)
              .map((s) => (
                <div key={s.label} className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-lg font-bold">{compact(s.value!)}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
          </div>

          <section>
            <h2 className="mb-3 font-heading text-xl font-bold">{(await getTranslations("hook"))("title")}</h2>
            <HookPanel videoId={video.id} duration={video.duration_seconds} initial={hookInitial} />
          </section>

          <section>
            <h2 className="mb-3 font-heading text-xl font-bold">{t("breakdown")}</h2>
            <Suspense
              fallback={
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className={`h-20 rounded-2xl ${i === 0 ? "sm:col-span-2" : ""}`} />
                  ))}
                </div>
              }
            >
              <Breakdown video={video} scores={scores} locale={locale} />
            </Suspense>
          </section>

          <section>
            <h2 className="mb-3 font-heading text-xl font-bold">{t("makeMyVersion")}</h2>
            <ScriptPanel
              videoId={video.id}
              products={(product ?? []).map((p) => ({ id: p.id as string, name: p.name as string, goal: isGoal(p.goal) ? p.goal : null }))}
              initialScripts={(scripts ?? []) as SavedScript[]}
              initialProductId={typeof productParam === "string" ? productParam : null}
            />
          </section>

          <Suspense fallback={null}>
            <CreatorHits video={video} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
