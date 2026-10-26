import { BarChart3, Eye, Film, Flame, Hash, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { RunSummary } from "@/lib/ai/schemas";
import type { RunTotals } from "@/lib/run-stats";

function HeadlineWithHighlight({ headline, highlight }: { headline: string; highlight: string }) {
  const i = highlight ? headline.indexOf(highlight) : -1;
  if (i < 0) return <>{headline}</>;
  return (
    <>
      {headline.slice(0, i)}
      <em className="text-primary">{highlight}</em>
      {headline.slice(i + highlight.length)}
    </>
  );
}

/** The research at a glance: AI headline, totals for every kept video, and the hashtags they share. */
export async function InsightCard({
  summary,
  totals,
  smallInTop10,
  topCount,
  tagHref,
}: {
  summary: RunSummary | null;
  totals: RunTotals;
  smallInTop10: number;
  topCount: number;
  /** Link that shows every result with this hashtag. */
  tagHref: (tag: string) => string;
}) {
  const t = await getTranslations("results");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });

  const tiles = [
    { icon: Film, value: format.number(totals.videos), label: t("tileVideos") },
    { icon: Eye, value: compact(totals.views), label: t("tileViews") },
    { icon: BarChart3, value: compact(totals.avgViews), label: t("tileAvgViews") },
    { icon: Users, value: format.number(totals.creators), label: t("tileCreators") },
    { icon: Hash, value: format.number(totals.hashtags), label: t("tileHashtags") },
  ];

  return (
    <section className="rounded-3xl border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Flame className="size-4" />
        </span>
        <div>
          <h2 className="font-heading text-2xl leading-tight font-bold md:text-3xl">
            {summary ? <HeadlineWithHighlight headline={summary.headline} highlight={summary.highlight} /> : t("noSummary")}
          </h2>
          {summary?.summary && <p className="mt-1 text-muted-foreground">{summary.summary}</p>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(({ icon: Icon, value, label }) => (
          <div key={label} className="rounded-2xl bg-muted p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" /> {label}
            </p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {totals.topHashtags.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{t("topHashtags")}</span> · {t("topHashtagsHint")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {totals.topHashtags.map((h) => (
              <Link key={h.tag} href={tagHref(h.tag)} scroll={false} className="chip">
                #{h.tag} <span className="opacity-60">{h.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {smallInTop10 > 0 && <p className="mt-4 text-sm text-muted-foreground">{t("smallNote", { n: smallInTop10, of: topCount })}</p>}
      {summary?.takeaway && <p className="mt-5 leading-relaxed">{summary.takeaway}</p>}
      {summary?.source === "sample" && <p className="mt-3 text-xs text-muted-foreground">{t("sampleSummary")}</p>}
    </section>
  );
}
