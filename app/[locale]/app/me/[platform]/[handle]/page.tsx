import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { profileUrl } from "@/components/tracking/account-row";
import { Link } from "@/i18n/navigation";
import {
  type ChannelPost,
  compareChannels,
  groupPerformance,
  lengthBucket,
  monthlyUsual,
  postingPattern,
  PATTERN_MIN_POSTS,
  snapshot,
  timelinePoints,
  weeklyGrowth,
} from "@/lib/account-analysis";
import { engagementRate } from "@/lib/scoring";
import { channelExtras, loadOwnChannel } from "@/lib/own-accounts";
import { createClient } from "@/lib/supabase/server";
import { ChannelAudit } from "./audit";
import { CompareTable, GroupBars, Timeline, WeekLine } from "./charts";

const WINDOWS = { d30: 30, d90: 90, y1: 365 } as const;
type WindowKey = keyof typeof WINDOWS;

/**
 * One of the founder's own channels: refreshed through the 24-hour cache when opened, then its snapshot, its hits
 * against its own normal, when it posts, and how its normal moves month to month. Public numbers only.
 */
export default async function ChannelPage({ params, searchParams }: PageProps<"/[locale]/app/me/[platform]/[handle]">) {
  const { locale, platform, handle: rawHandle } = await params;
  setRequestLocale(locale);
  if (platform !== "tiktok" && platform !== "youtube" && platform !== "instagram") notFound();
  const handle = decodeURIComponent(rawHandle);
  const supabase = await createClient();
  // Only the user's own channels open here (RLS).
  const { data: own } = await supabase.from("own_accounts").select("id").eq("platform", platform).eq("handle", handle).maybeSingle();
  if (!own) notFound();
  const sp = await searchParams;
  const windowKey: WindowKey = typeof sp.w === "string" && sp.w in WINDOWS ? (sp.w as WindowKey) : "d90";
  const t = await getTranslations("me");
  const format = await getFormatter();
  const stats = await loadOwnChannel(platform, handle);
  const extras = await channelExtras(supabase, platform, handle);

  const { now, posts, snap, pattern, months, shown } = analyse(stats.videos, WINDOWS[windowKey]);
  const tc = await getTranslations("me.charts");
  // The charts: every post on a timeline, groups by format / hook / length, you vs tracked accounts, growth by week.
  const seconds = new Map(stats.videos.map((v) => [String(v.dbId ?? v.platformVideoId), v.durationSeconds]));
  const byFormat = extras.tags ? groupPerformance(posts, (p) => extras.tags?.[p.id]?.format ?? null) : [];
  const byHook = extras.tags ? groupPerformance(posts, (p) => extras.tags?.[p.id]?.hook ?? null) : [];
  const byLength = groupPerformance(posts, (p) => lengthBucket(seconds.get(p.id)));
  const withEngagement = (videos: typeof stats.videos) =>
    videos.map((v) => ({ id: String(v.dbId ?? v.platformVideoId), views: v.views, publishedAt: v.publishedAt, engagement: engagementRate(v) }));
  const compare = compareChannels(
    [
      { handle, own: true, posts: withEngagement(stats.videos) },
      ...extras.others.map((o) => ({ handle: o.handle, own: false, posts: withEngagement(o.videos) })),
    ],
    now,
  );
  const updatedOf = new Map(extras.others.map((o) => [o.handle, o.fetchedAt]));
  const weeks = weeklyGrowth(extras.snapshots);
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const dayNames = t.raw("days") as string[];

  const tile = (label: string, value: string, hint?: string) => (
    <div className="rounded-2xl bg-white/70 p-3 dark:bg-card">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-heading text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div>
      <header className="page-wash px-4 pt-8 pb-8 md:px-10">
        <Link href="/app/me" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("back")}
        </Link>
        <h1 className="mt-4 font-heading text-3xl font-bold">{stats.displayName ?? `@${handle}`}</h1>
        <a href={profileUrl(platform, handle)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          @{handle} · {platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : "YouTube"} <ExternalLink className="size-3.5" />
        </a>
        {stats.fetchedAt && <p className="mt-1 text-xs text-muted-foreground">{t("updated", { when: format.relativeTime(new Date(stats.fetchedAt), now), n: posts.length })}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" data-me="snapshot">
          {tile(t("followersLabel"), stats.followers !== null ? compact(stats.followers) : "—")}
          {tile(t("usualLabel"), snap.usual !== null ? compact(snap.usual) : "—", t("usualHint"))}
          {tile(t("hitRate"), snap.hitRate !== null ? `${Math.round(snap.hitRate * 100)}%` : "—", t("hitsOf", { hits: snap.hits, posts: snap.posts }))}
          {tile(t("perWeek"), String(snap.postsPerWeek), t("perWeekHint"))}
        </div>
        {snap.trend.length > 1 && <Sparkline values={snap.trend} label={t("trend", { n: snap.trend.length })} />}
      </header>

      <div className="space-y-8 px-4 pb-16 md:px-10">
        <ChannelAudit supabase={supabase} platform={platform} handle={handle} fetchedAt={stats.fetchedAt} now={now} />

        <section className="space-y-3 rounded-3xl border bg-card p-4" data-me="timeline">
          <div>
            <h2 className="font-heading text-lg font-bold">{tc("timelineTitle")}</h2>
            <p className="text-xs text-muted-foreground">{tc("timelineHint")}</p>
          </div>
          <Timeline points={timelinePoints(posts)} usual={snap.usual} hrefOf={(id) => `/${locale}/app/video/${id}`} />
        </section>

        <section className="space-y-4 rounded-3xl border bg-card p-4" data-me="what-works">
          <div>
            <h2 className="font-heading text-lg font-bold">{tc("worksTitle")}</h2>
            <p className="text-xs text-muted-foreground">{tc("worksHint")}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {extras.tags ? (
              <>
                <GroupBars title={tc("byFormat")} rows={byFormat} nameOf={(k) => t(`formats.${k}`)} />
                <GroupBars title={tc("byHook")} rows={byHook} nameOf={(k) => t(`hooks.${k}`)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground md:col-span-2">{tc("needAnalysis")}</p>
            )}
            <GroupBars title={tc("byLength")} rows={byLength} nameOf={(k) => t(`lengths.${k}`)} />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <section className="space-y-3 rounded-3xl border bg-card p-4">
            <div>
              <h2 className="font-heading text-lg font-bold">{tc("compareTitle")}</h2>
              <p className="text-xs text-muted-foreground">{tc("compareHint")}</p>
            </div>
            {compare.length > 1 ? (
              <CompareTable
                rows={compare}
                updatedOf={(h) => {
                  const at = updatedOf.get(h);
                  return at ? tc("updatedShort", { when: format.relativeTime(new Date(at), now) }) : null;
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{tc("compareEmpty")}</p>
            )}
          </section>
          <section className="space-y-3 rounded-3xl border bg-card p-4" data-me="growth">
            <h2 className="font-heading text-lg font-bold">{tc("growthTitle")}</h2>
            {weeks.length >= 2 ? (
              <div className="space-y-4">
                <WeekLine title={tc("followersWeek")} points={weeks.map((w) => ({ week: w.week, value: w.followers }))} />
                <WeekLine title={tc("usualWeek")} points={weeks.map((w) => ({ week: w.week, value: w.usual }))} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {tc("growthStarts", {
                  date: format.dateTime(new Date(extras.snapshots[0] ? `${extras.snapshots[0].day}T00:00:00Z` : now), { day: "numeric", month: "long" }),
                })}
              </p>
            )}
          </section>
        </div>
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg font-bold">{t("hitsTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("hitsHint", { usual: snap.usual !== null ? compact(snap.usual) : "—" })}</p>
            </div>
            <div className="flex gap-1.5">
              {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
                <Link key={k} href={`/app/me/${platform}/${encodeURIComponent(handle)}?w=${k}`} scroll={false} className={`chip ${k === windowKey ? "chip-on" : ""}`}>
                  {t(`window.${k}`)}
                </Link>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noPosts")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((v) => (
                <OutlierCard key={v.platformVideoId} video={v} />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-2 rounded-3xl border bg-card p-4" data-me="pattern">
            <h2 className="font-heading text-lg font-bold">{t("patternTitle")}</h2>
            {pattern ? (
              <>
                <p className="text-xs text-muted-foreground">{t("patternHint")}</p>
                <Bars
                  rows={pattern.days.map((d) => ({ label: dayNames[d.day], hits: d.hits, others: d.others }))}
                  hitsLabel={t("hits")}
                  othersLabel={t("others")}
                />
                <Bars rows={pattern.parts.map((p) => ({ label: t(`parts.${p.part}`), hits: p.hits, others: p.others }))} hitsLabel={t("hits")} othersLabel={t("others")} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("patternWait", { min: PATTERN_MIN_POSTS, n: posts.length })}</p>
            )}
          </section>
          <section className="space-y-2 rounded-3xl border bg-card p-4" data-me="months">
            <h2 className="font-heading text-lg font-bold">{t("monthsTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("monthsHint")}</p>
            <ul className="space-y-1.5 text-sm">
              {months.map((m) => {
                const max = Math.max(1, ...months.map((x) => x.usual ?? 0));
                return (
                  <li key={m.month} className="grid grid-cols-[72px_1fr_auto] items-center gap-2">
                    <span className="text-xs text-muted-foreground">{format.dateTime(new Date(`${m.month}-01T00:00:00Z`), { month: "short", year: "2-digit" })}</span>
                    <span className="h-2 rounded-full bg-muted">
                      <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.round(((m.usual ?? 0) / max) * 100)}%` }} />
                    </span>
                    <span className="text-xs tabular-nums">
                      {m.usual !== null ? compact(m.usual) : "—"} <span className="text-muted-foreground">· {t("nPosts", { n: m.posts })}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Everything the page shows about the posts, as of now: snapshot, pattern, months, and the posts in the window. */
function analyse(videos: Awaited<ReturnType<typeof loadOwnChannel>>["videos"], days: number) {
  const now = Date.now();
  const posts: ChannelPost[] = videos.map((v) => ({ id: String(v.dbId ?? v.platformVideoId), views: v.views, publishedAt: v.publishedAt }));
  return {
    now,
    posts,
    snap: snapshot(posts, now),
    pattern: postingPattern(posts),
    months: monthlyUsual(posts, now),
    shown: videos.filter((v) => v.publishedAt && now - Date.parse(v.publishedAt) <= days * 864e5),
  };
}

/**
 * Views of the latest posts, oldest first, as a small line. Log scale: one viral post (seen live: 384K against a usual
 * ~800) would otherwise flatten every other post into the floor.
 */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const scaled = values.map((v) => Math.log10(v + 1));
  const max = Math.max(...scaled, 1);
  const min = Math.min(...scaled);
  const w = 300;
  const h = 48;
  const y = (v: number) => h - ((v - min) / Math.max(max - min, 0.001)) * (h - 4) - 2;
  const points = scaled.map((v, i) => `${((i / (scaled.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <figure className="mt-4 max-w-md">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" role="img" aria-label={label}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** Hits and other posts side by side per row (a weekday or a time of day). */
function Bars({ rows, hitsLabel, othersLabel }: { rows: { label: string; hits: number; others: number }[]; hitsLabel: string; othersLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.hits + r.others));
  return (
    <div className="space-y-1">
      <p className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-primary" /> {hitsLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-muted-foreground/30" /> {othersLabel}
        </span>
      </p>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="flex h-2 overflow-hidden rounded-full bg-muted">
            <span className="h-2 bg-primary" style={{ width: `${(r.hits / max) * 100}%` }} />
            <span className="h-2 bg-muted-foreground/30" style={{ width: `${(r.others / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {r.hits}/{r.hits + r.others}
          </span>
        </div>
      ))}
    </div>
  );
}
