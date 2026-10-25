import { Eye, Flame, Lightbulb, PenLine, Quote } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import type { Pattern } from "@/lib/ai/schemas";
import { formatMultiplier } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";

/** "Formulas that worked": 3-5 repeatable patterns, each with a hook, an idea for the user's product and examples. */
export async function Patterns({
  patterns,
  videos,
  productName,
}: {
  patterns: Pattern[];
  videos: ScoredVideo[];
  productName: string | null;
}) {
  const t = await getTranslations("results");
  const format = await getFormatter();
  const byId = new Map(videos.filter((v) => v.dbId).map((v) => [v.dbId!, v]));
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-lg font-bold">{t("patternsTitle")}</h3>
        <span className="text-xs text-muted-foreground">{t("patternsHint")}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {patterns.map((p, n) => {
          const examples = p.videoIds.map((id) => byId.get(id)).filter((v): v is ScoredVideo => !!v);
          return (
            <article key={p.name} className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("patternN", { n: n + 1 })}</p>
              <h4 className="mt-1 font-heading text-xl font-bold">{p.name}</h4>
              <p className="mt-2 text-sm text-muted-foreground">{p.why}</p>

              <div className="mt-4 mb-4 space-y-2 text-sm">
                <p className="flex gap-2 rounded-2xl bg-accent px-3 py-2 text-accent-foreground">
                  <Quote className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{t("patternHook")}</span> {p.hook}
                  </span>
                </p>
                <p className="flex gap-2 rounded-2xl bg-muted px-3 py-2">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold">{productName ? t("patternIdeaFor", { product: productName }) : t("patternIdea")}</span>{" "}
                    {p.idea}
                  </span>
                </p>
              </div>

              <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                <div className="flex gap-2">
                  {examples.map((v) => (
                    <Link
                      key={v.dbId}
                      href={`/app/video/${v.dbId}`}
                      className="relative block aspect-[9/14] w-[4.5rem] overflow-hidden rounded-xl bg-muted"
                      title={`@${v.creatorHandle}`}
                    >
                      <Thumb src={v.thumbnailUrl} />
                      <span className="absolute inset-x-1 bottom-1 flex flex-wrap gap-0.5 text-[10px] font-semibold text-white">
                        {v.views !== null && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-black/70 px-1.5">
                            <Eye className="size-2.5" /> {compact(v.views)}
                          </span>
                        )}
                        {(v.usual ?? v.reach) !== null && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--breakout)] px-1.5">
                            <Flame className="size-2.5" /> {formatMultiplier((v.usual ?? v.reach)!)}×
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
                {examples[0] && (
                  <Link
                    href={`/app/video/${examples[0].dbId}`}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <PenLine className="size-4" /> {t("patternScript")}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
