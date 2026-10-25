import { Flame } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { RunSummary } from "@/lib/ai/schemas";

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

export async function InsightCard({
  summary,
  totalVideos,
  topViews,
  smallInTop10,
  topCount,
}: {
  summary: RunSummary | null;
  totalVideos: number;
  topViews: number | null;
  smallInTop10: number;
  topCount: number;
}) {
  const t = await getTranslations("results");
  const format = await getFormatter();

  const tiles = [
    { value: format.number(totalVideos), label: t("tileVideos") },
    { value: topViews ? format.number(topViews, { notation: "compact" }) : "–", label: t("tileTopViews") },
    { value: t("tileSmallValue", { n: smallInTop10, of: topCount }), label: t("tileSmall") },
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
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl bg-muted p-4">
            <p className="font-heading text-2xl font-bold">{tile.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>
      {summary?.takeaway && <p className="mt-5 leading-relaxed">{summary.takeaway}</p>}
      {summary?.source === "sample" && <p className="mt-3 text-xs text-muted-foreground">{t("sampleSummary")}</p>}
    </section>
  );
}
