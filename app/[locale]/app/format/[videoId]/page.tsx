import { ArrowLeft, Building2, Music2, PenLine, ShoppingBag, Store, TrendingDown, TrendingUp } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PerDayChart, StageBadge } from "@/components/formats/format-bits";
import { OutlierCard } from "@/components/outlier-card";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { type VideoRow, videoFromRow } from "@/lib/db-mappers";
import { getFormat, isFresh, loadFormatVideos } from "@/lib/formats";
import { createClient } from "@/lib/supabase/server";
import { FormatBuilder } from "./format-builder";

const SEGMENT_ICON = { b2b: Building2, consumer: ShoppingBag, local: Store } as const;

/** "Who else made this kind of clip?": one format, the topics people used it for, its sounds and examples. */
export default async function FormatPage({ params }: PageProps<"/[locale]/app/format/[videoId]">) {
  const { locale, videoId } = await params;
  setRequestLocale(locale);
  const id = Number(videoId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const t = await getTranslations("format");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const supabase = await createClient();

  const [{ data: seedRow }, cached, { data: savedRows }] = await Promise.all([
    supabase.from("videos").select("*").eq("id", id).maybeSingle<VideoRow>(),
    getFormat(id),
    supabase.from("saved_videos").select("video_id"),
  ]);
  if (!seedRow) notFound();
  const seed = videoFromRow(seedRow, { reach: null, usual: null, usualViews: null, label: "normal" });
  const saved = new Set((savedRows ?? []).map((r) => r.video_id as number));
  const ready = cached && isFresh(cached) ? cached : null;
  const videos = ready ? await loadFormatVideos(ready.videoIds) : [];
  const byId = new Map(videos.map((v) => [v.dbId!, v]));
  const f = ready?.data;
  const change = f && f.lastWeek ? Math.round(((f.thisWeek - f.lastWeek) / f.lastWeek) * 100) : null;

  return (
    <div>
      <header className="page-wash px-10 pt-8 pb-8">
        <Link href={`/app/video/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("back")}
        </Link>
        <div className="mt-4 flex gap-5">
          <div className="relative hidden aspect-[9/14] w-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:block">
            <Thumb src={seed.thumbnailUrl} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("eyebrow")}</p>
            <h1 className="mt-1 font-heading text-3xl font-bold">{f?.name ?? t("loadingTitle")}</h1>
            {f && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <StageBadge stage={f.stage} />
                <span>{t("thisWeek", { n: f.thisWeek })}</span>
                {change !== null && (
                  <span className={`inline-flex items-center gap-1 ${change >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {t("vsLastWeek", { p: change > 0 ? `+${change}` : String(change) })}
                  </span>
                )}
              </div>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{t("seedFrom", { handle: seed.creatorHandle })}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-10 pb-16">
        {!f && <FormatBuilder videoId={id} />}

        {f && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border bg-card p-5 shadow-sm">
                <h2 className="font-heading text-lg font-bold">{t("howTo")}</h2>
                <p className="mt-2 text-muted-foreground">{f.howTo}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-muted p-4">
                    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{t("keepSame")}</p>
                    <p className="mt-1 text-sm">{f.keepSame}</p>
                  </div>
                  <div className="rounded-2xl bg-accent p-4 text-accent-foreground">
                    <p className="text-xs font-semibold tracking-widest uppercase opacity-70">{t("makeYours")}</p>
                    <p className="mt-1 text-sm">{f.makeYours}</p>
                  </div>
                </div>
                <Link
                  href={`/app/video/${id}`}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <PenLine className="size-4" /> {t("writeScript")}
                </Link>
              </div>
              <div className="rounded-3xl border bg-card p-5 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-heading text-lg font-bold">{t("perDay")}</h2>
                  <span className="text-xs text-muted-foreground">{t("last30")}</span>
                </div>
                <div className="mt-4">
                  <PerDayChart perDay={f.perDay} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { v: compact(f.totals.videos), l: t("tileVideos") },
                    { v: compact(f.totals.creators), l: t("tileCreators") },
                    { v: compact(f.totals.views), l: t("tileViews") },
                  ].map((x) => (
                    <div key={x.l} className="rounded-2xl bg-muted p-3">
                      <p className="font-heading text-xl font-bold">{x.v}</p>
                      <p className="text-[11px] text-muted-foreground">{x.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-heading text-lg font-bold">{t("whoFor")}</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {f.whoFor.map((w) => {
                  const Icon = SEGMENT_ICON[w.segment];
                  return (
                    <div key={w.segment} className="rounded-2xl border bg-card p-4">
                      <p className="flex items-center gap-2 font-semibold">
                        <Icon className="size-4 text-primary" /> {t(`segment.${w.segment}`)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{w.idea}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {f.topics.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-lg font-bold">{t("topics")}</h2>
                  <span className="text-xs text-muted-foreground">{t("topicsHint")}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {f.topics.map((topic) => {
                    const ex = topic.videoIds.map((vid) => byId.get(vid)).filter((v) => !!v);
                    const best = ex.reduce((m, v) => Math.max(m, v!.views ?? 0), 0);
                    return (
                      <div key={topic.topic} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                        <div className="flex gap-1.5">
                          {ex.slice(0, 3).map((v) => (
                            <Link key={v!.dbId} href={`/app/video/${v!.dbId}`} className="relative block aspect-[9/14] w-12 overflow-hidden rounded-lg bg-muted">
                              <Thumb src={v!.thumbnailUrl} />
                            </Link>
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold">{topic.topic}</p>
                          <p className="text-xs text-muted-foreground">{t("topicStats", { n: ex.length, best: compact(best) })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {f.sounds.length > 0 && (
              <section>
                <h2 className="mb-3 font-heading text-lg font-bold">{t("sounds")}</h2>
                <ul className="divide-y rounded-2xl border bg-card">
                  {f.sounds.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Music2 className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{s.title || t("unnamedSound")}</span>
                      <span className="text-muted-foreground">{t("soundStats", { n: s.count, avg: compact(s.avgViews) })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading text-lg font-bold">{t("examples", { n: videos.length })}</h2>
                <span className="text-xs text-muted-foreground">
                  {t("updated", { when: format.relativeTime(new Date(ready!.updatedAt)) })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {videos.map((v) => (
                  <OutlierCard key={v.dbId} video={v} saved={saved.has(v.dbId!)} />
                ))}
              </div>
            </section>
            {f.source === "sample" && <p className="text-xs text-muted-foreground">{t("sample")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
