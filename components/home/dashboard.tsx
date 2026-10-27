import { ArrowRight, Flame, Hash, Layers, Package, Plus, Search, Target, TrendingUp } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { StageBadge } from "@/components/formats/format-bits";
import { OutlierCard } from "@/components/outlier-card";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { type ResultRow, videoFromResultRow } from "@/lib/db-mappers";
import { listFormats } from "@/lib/formats";
import { isGoal } from "@/lib/goals";
import { risingHashtags } from "@/lib/run-stats";
import { bestScore } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const MAX_PRODUCTS = 5;
const WINNERS = 5;
const MONTH_MS = 30 * 864e5;
/** Results added in the last 30 days are enough for the outliers and this week's hashtags. */
const RECENT_RESULTS = 400;

const recentSince = () => new Date(Date.now() - MONTH_MS).toISOString();
const postedWithin = (v: ScoredVideo, ms: number) => !!v.publishedAt && Date.now() - new Date(v.publishedAt).getTime() <= ms;

/**
 * Home, under the chat: the user's products with their goal and last research, outliers their researches found
 * recently, hashtags rising this week and formats on the rise. Everything comes from stored data (no credits).
 * `productId` narrows the outliers and hashtags to that product's researches.
 */
export async function HomeDashboard({ productId = null }: { productId?: string | null }) {
  const t = await getTranslations("home");
  const tg = await getTranslations("goals");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: products }, { data: runs }, { data: savedRows }, formats] = await Promise.all([
    supabase.from("products").select("id, name, goal").order("created_at"),
    supabase.from("research_runs").select("id, product_id, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("saved_videos").select("video_id"),
    listFormats(),
  ]);
  if (!products?.length && !runs?.length) return null;

  // One product's researches only, when a product is picked (and is one of theirs).
  const picked = products?.find((p) => p.id === productId) ?? null;
  const pickedRuns = picked ? (runs ?? []).filter((r) => r.product_id === picked.id).map((r) => r.id as string) : null;
  let resultsQuery = supabase
    .from("run_results")
    .select("keyword, reach_score, usual_score, usual_views, label, copyable, added_at, videos(*)")
    .gte("added_at", recentSince())
    .order("added_at", { ascending: false })
    .limit(RECENT_RESULTS);
  if (pickedRuns) resultsQuery = resultsQuery.in("run_id", pickedRuns);
  // A picked product with no researches yet has nothing to show (and an empty `in` list is not a valid filter).
  const { data: results } = pickedRuns && !pickedRuns.length ? { data: [] } : await resultsQuery;

  const lastRun = new Map<string, { id: string; at: string }>();
  const runCount = new Map<string, number>();
  for (const r of runs ?? []) {
    const pid = r.product_id as string | null;
    if (!pid) continue;
    runCount.set(pid, (runCount.get(pid) ?? 0) + 1);
    if (!lastRun.has(pid)) lastRun.set(pid, { id: r.id as string, at: r.created_at as string });
  }

  // One card per video (a video can be in several researches), newest results first.
  const seen = new Set<number>();
  const recent = ((results ?? []) as unknown as ResultRow[])
    .map(videoFromResultRow)
    .filter((v): v is ScoredVideo => v !== null && v.dbId !== undefined && !seen.has(v.dbId) && !!seen.add(v.dbId));
  const winners = recent
    .filter((v) => v.label === "breakout" && postedWithin(v, MONTH_MS))
    .sort((a, b) => bestScore(b) - bestScore(a))
    .slice(0, WINNERS);
  const tags = risingHashtags(recent);
  const rising = formats.filter((f) => f.data.stage === "fresh" || f.data.stage === "rising").slice(0, 3);
  const saved = new Set((savedRows ?? []).map((r) => r.video_id as number));

  const thumbIds = rising.flatMap((f) => f.videoIds.slice(0, 3));
  const { data: thumbs } = thumbIds.length ? await supabase.from("videos").select("id, thumbnail_url").in("id", thumbIds) : { data: [] };
  const thumbOf = new Map((thumbs ?? []).map((r) => [r.id as number, r.thumbnail_url as string | null]));

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle icon={Package} title={t("products")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(products ?? []).map((p) => {
            const last = lastRun.get(p.id as string);
            const goal = isGoal(p.goal) ? p.goal : null;
            return (
              <div key={p.id} className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading text-lg leading-tight font-bold">{p.name}</p>
                  {goal && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                      <Target className="size-3" /> {tg(`${goal}.short`)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {last
                    ? `${t("researchCount", { n: runCount.get(p.id as string) ?? 0 })} · ${t("lastRun", { when: format.relativeTime(new Date(last.at)) })}`
                    : t("noRuns")}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <Link
                    href={`/app?product=${p.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Search className="size-3.5" /> {t("research")}
                  </Link>
                  {last && (
                    <Link href={`/app/research/${last.id}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs hover:bg-muted">
                      {t("latest")} <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {(products?.length ?? 0) < MAX_PRODUCTS && (
            <Link
              href="/app/product"
              className="grid min-h-28 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="size-4" /> {t("addProduct")}
              </span>
            </Link>
          )}
        </div>
      </section>

      {(products?.length ?? 0) > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{t("showFor")}</span>
          <Link href="/app" scroll={false} className={`chip ${picked ? "" : "chip-on"}`}>
            {t("allProducts")}
          </Link>
          {(products ?? []).map((p) => (
            <Link key={p.id} href={`/app?dash=${p.id}`} scroll={false} className={`chip ${picked?.id === p.id ? "chip-on" : ""}`}>
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {winners.length > 0 && (
        <section>
          <SectionTitle icon={Flame} title={t("winners")} hint={t("winnersHint")} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {winners.map((v) => (
              <OutlierCard key={v.dbId} video={v} saved={saved.has(v.dbId!)} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <SectionTitle icon={Hash} title={t("hashtags")} hint={t("hashtagsHint")} />
          {tags.length ? (
            <ul className="divide-y">
              {tags.slice(0, 8).map((x, i) => (
                <li key={x.tag}>
                  <Link href={`/app?${new URLSearchParams({ q: `#${x.tag}` })}`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">#{x.tag}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{t("tagClips", { n: x.thisWeek })}</span>
                    {x.thisWeek > x.lastWeek && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">
                        <TrendingUp className="size-3" /> {x.lastWeek === 0 ? t("tagNew") : `+${x.thisWeek - x.lastWeek}`}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">{t("hashtagsEmpty")}</p>
          )}
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <SectionTitle icon={Layers} title={t("formats")} hint={t("formatsHint")} />
          {rising.length ? (
            <ul className="space-y-2">
              {rising.map((f) => (
                <li key={f.id}>
                  <Link href={`/app/format/${f.seedVideoId}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-muted">
                    <span className="flex gap-1">
                      {f.videoIds.slice(0, 3).map((id) => (
                        <span key={id} className="relative block aspect-[9/14] w-9 overflow-hidden rounded-md bg-muted">
                          <Thumb src={thumbOf.get(id) ?? null} videoId={id} />
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{f.data.name}</span>
                      <span className="text-xs text-muted-foreground">{t("formatStat", { n: f.data.thisWeek })}</span>
                    </span>
                    <StageBadge stage={f.data.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">{t("formatsEmpty")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: typeof Flame; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Same shape as the dashboard while it loads, under an already usable chat. */
export function HomeDashboardSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="aspect-[9/14] rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
