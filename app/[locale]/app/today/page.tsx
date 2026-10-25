import { BellPlus, Lightbulb, PenLine, Quote, Radar } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { SaveButton } from "@/components/save-button";
import { Link } from "@/i18n/navigation";
import { type VideoRow, videoFromRow } from "@/lib/db-mappers";
import { createClient } from "@/lib/supabase/server";
import { bangkokDay, countTodaySources, getTodayDigest } from "@/lib/today";
import { TodayBuilder } from "./today-builder";

/** "What to post today": 3-5 ideas from this week's new breakouts. Built on the first visit of the day. */
export default async function TodayPage({ params }: PageProps<"/[locale]/app/today">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("today");
  const format = await getFormatter();
  const supabase = await createClient();

  const [digest, sources, { data: product }] = await Promise.all([
    getTodayDigest(),
    countTodaySources(),
    supabase.from("products").select("name").limit(1).maybeSingle(),
  ]);

  const ids = digest?.items.map((i) => i.videoId) ?? [];
  const [{ data: rows }, { data: savedRows }] = ids.length
    ? await Promise.all([
        supabase.from("videos").select("*").in("id", ids),
        supabase.from("saved_videos").select("video_id").in("video_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const byId = new Map(((rows ?? []) as VideoRow[]).map((r) => [r.id, r]));
  const saved = new Set((savedRows ?? []).map((r) => r.video_id as number));
  const hasSources = sources.tracked + sources.topics > 0;

  return (
    <div>
      <header className="page-wash px-10 pt-10 pb-8">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">
          {format.dateTime(new Date(`${bangkokDay()}T00:00:00+07:00`), { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        {hasSources && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t("sources", { tracked: sources.tracked, topics: sources.topics })}
            <Link href="/app/tracking" className="text-primary hover:underline">
              {t("manageTracking")}
            </Link>
          </p>
        )}
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-10 pb-16">
        {!hasSources && (
          <section className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <h2 className="font-heading text-xl font-bold">{t("emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{t("emptyHint")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/app/tracking" className="chip chip-on">
                <Radar className="size-3.5" /> {t("emptyTrack")}
              </Link>
              <Link href="/app" className="chip">
                <BellPlus className="size-3.5" /> {t("emptyFollow")}
              </Link>
            </div>
          </section>
        )}

        {hasSources && !digest && <TodayBuilder tracked={sources.tracked} topics={sources.topics} />}

        {digest && digest.items.length === 0 && (
          <section className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <h2 className="font-heading text-xl font-bold">{t("quietTitle")}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{t("quietHint")}</p>
          </section>
        )}

        {digest?.items.map((item, n) => {
          const row = byId.get(item.videoId);
          if (!row) return null;
          const video = videoFromRow(row, item.scores);
          return (
            <article key={item.videoId} className="grid gap-5 rounded-3xl border bg-card p-5 shadow-sm md:grid-cols-[200px_1fr]">
              <OutlierCard video={video} saved={saved.has(item.videoId)} variant="carousel" />
              <div className="flex flex-col">
                <p className="text-xs font-semibold text-primary">
                  {t("ideaN", { n: n + 1 })} ·{" "}
                  {item.source === "tracked" ? t("fromTracked", { who: item.sourceLabel }) : t("fromTopic", { topic: item.sourceLabel })}
                </p>
                <h2 className="mt-1 font-heading text-2xl leading-tight font-bold">{item.title}</h2>
                <p className="mt-2 text-muted-foreground">{item.why}</p>
                <div className="mt-4 space-y-2 text-sm">
                  {item.hook && (
                    <p className="flex gap-2 rounded-2xl bg-accent px-3 py-2 text-accent-foreground">
                      <Quote className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <span className="font-semibold">{t("hook")}</span> {item.hook}
                      </span>
                    </p>
                  )}
                  <p className="flex gap-2 rounded-2xl bg-muted px-3 py-2">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-semibold">
                        {product?.name ? t("forProduct", { product: product.name }) : t("yourVersion")}
                      </span>{" "}
                      {item.angle}
                    </span>
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <Link
                    href={`/app/video/${item.videoId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <PenLine className="size-4" /> {t("writeScript")}
                  </Link>
                  <SaveButton videoId={item.videoId} initialSaved={saved.has(item.videoId)} />
                </div>
              </div>
            </article>
          );
        })}

        {digest && <p className="text-center text-xs text-muted-foreground">{t("footer", { n: digest.stats?.candidates ?? 0 })}</p>}
      </div>
    </div>
  );
}
