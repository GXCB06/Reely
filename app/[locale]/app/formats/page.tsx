import { Layers } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PerDayChart, StageBadge } from "@/components/formats/format-bits";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { listFormats } from "@/lib/formats";
import { createClient } from "@/lib/supabase/server";

/** Formats board: every format anyone explored, most creators posting it this week first. */
export default async function FormatsPage({ params }: PageProps<"/[locale]/app/formats">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("format");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const formats = await listFormats();

  const thumbIds = formats.flatMap((f) => f.videoIds.slice(0, 4));
  const supabase = await createClient();
  const { data: thumbs } = thumbIds.length
    ? await supabase.from("videos").select("id, thumbnail_url").in("id", thumbIds)
    : { data: [] };
  const thumbOf = new Map((thumbs ?? []).map((r) => [r.id as number, r.thumbnail_url as string | null]));

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("boardTitle")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("boardSubtitle")}</p>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 px-4 md:px-10 pb-16">
        {formats.length === 0 && (
          <section className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <Layers className="mx-auto size-8 text-primary" />
            <h2 className="mt-3 font-heading text-xl font-bold">{t("boardEmpty")}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{t("boardEmptyHint")}</p>
          </section>
        )}
        {formats.map((f, n) => (
          <Link
            key={f.id}
            href={`/app/format/${f.seedVideoId}`}
            className="grid gap-4 rounded-3xl border bg-card p-5 shadow-sm transition hover:shadow-md md:grid-cols-[auto_1fr_220px]"
          >
            <span className="grid size-8 place-items-center rounded-lg border text-sm font-bold text-primary">{n + 1}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-lg font-bold">{f.data.name}</h2>
                <StageBadge stage={f.data.stage} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{f.data.howTo}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("boardStats", { week: f.data.thisWeek, videos: f.data.totals.videos, views: compact(f.data.totals.views) })}
              </p>
              <div className="mt-3 flex gap-1.5">
                {f.videoIds.slice(0, 4).map((id) => (
                  <span key={id} className="relative block aspect-[9/14] w-14 overflow-hidden rounded-lg bg-muted">
                    <Thumb src={thumbOf.get(id) ?? null} videoId={id} />
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden md:block">
              <PerDayChart perDay={f.data.perDay} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
