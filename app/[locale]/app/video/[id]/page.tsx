import { ArrowLeft, ExternalLink, Flame } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { SaveButton } from "@/components/save-button";
import { Thumb } from "@/components/thumb";
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
import type { SavedScript } from "./actions";
import { ScriptPanel } from "./script-panel";

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

export default async function VideoPage({ params }: PageProps<"/[locale]/app/video/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("video");
  const ts = await getTranslations("search");
  const format = await getFormatter();
  const supabase = await createClient();

  const videoId = Number(id);
  if (!Number.isInteger(videoId)) notFound();
  const { data: video } = await supabase.from("videos").select("*").eq("id", videoId).maybeSingle<VideoRow>();
  if (!video) notFound();

  const [{ data: creator }, { data: savedRow }, { data: product }, { data: scripts }, { data: trackedRow }] = await Promise.all([
    supabase.from("creators").select("usual_views").eq("platform", video.platform).eq("handle", video.creator_handle).maybeSingle(),
    supabase.from("saved_videos").select("video_id").eq("video_id", videoId).maybeSingle(),
    supabase.from("products").select("id, name, goal").order("created_at"),
    supabase.from("scripts").select("id, content, created_at").eq("video_id", videoId).order("created_at", { ascending: false }),
    supabase.from("tracked_accounts").select("id").eq("platform", video.platform).eq("handle", video.creator_handle).maybeSingle(),
  ]);
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
    <div className="px-10 py-8">
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-muted">
            <div className="aspect-[9/14] w-full">
              <Thumb src={video.thumbnail_url} videoId={video.id} />
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
          {video.platform !== "instagram" && (
            <TrackButton platform={video.platform} handle={video.creator_handle} initialTracked={Boolean(trackedRow)} />
          )}
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
            />
          </section>
        </div>
      </div>
    </div>
  );
}
