import { ArrowRight, ExternalLink } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { OutlierCard } from "@/components/outlier-card";
import { UntrackButton } from "@/components/tracking/untrack-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Platform } from "@/lib/adapters/types";
import { type AccountStats, loadAccount, refreshIfStale } from "@/lib/tracking";

const STRIP_LIMIT = 8;

export function profileUrl(platform: Platform, handle: string) {
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  return /^UC[\w-]{22}$/.test(handle) ? `https://www.youtube.com/channel/${handle}` : `https://www.youtube.com/@${handle}`;
}

/** Tiny posts-per-month bar chart (Peekly-style). */
export async function MonthBars({ data }: { data: AccountStats["postsPerMonth"] }) {
  const format = await getFormatter();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-16 items-end gap-2">
      {data.map((d, i) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">{d.count}</span>
          <div
            className={`w-full rounded-md ${i === data.length - 1 ? "bg-primary" : "bg-primary/25"}`}
            style={{ height: `${Math.max(4, (d.count / max) * 40)}px` }}
          />
          <span className="text-[10px] text-muted-foreground">
            {format.dateTime(new Date(`${d.month}-01T00:00:00Z`), { month: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

export async function KpiTiles({ stats }: { stats: AccountStats }) {
  const t = await getTranslations("tracking");
  const format = await getFormatter();
  const compact = (n: number | null) => (n === null ? "–" : format.number(n, { notation: "compact", maximumFractionDigits: 1 }));
  const tiles = [
    { label: t("kpiFollowers"), value: compact(stats.followers) },
    { label: t("kpiUsual"), value: compact(stats.usualViews) },
    { label: t("kpiBreakouts"), value: String(stats.breakouts30d), accent: stats.breakouts30d > 0 },
    { label: t("kpiPosts"), value: String(stats.sampleSize) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-muted p-2.5">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{tile.label}</p>
          <p className={`mt-0.5 text-lg font-bold ${tile.accent ? "text-[var(--breakout)]" : ""}`}>{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

/** One tracked account: summary panel on the left, its recent videos (biggest outliers first) on the right. */
export async function AccountRow({ id, platform, handle }: { id: string; platform: Platform; handle: string }) {
  const t = await getTranslations("tracking");
  const format = await getFormatter();
  const refresh = await refreshIfStale(platform, handle);
  const stats = await loadAccount(platform, handle);
  const strip = stats.videos.slice(0, STRIP_LIMIT);
  const more = stats.videos.length - strip.length;
  const detailHref = `/app/tracking/${platform}/${encodeURIComponent(handle)}`;

  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-4 shadow-sm lg:flex-row">
      <div className="w-full shrink-0 space-y-3 lg:w-72">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
              {(stats.displayName ?? handle).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{stats.displayName ?? `@${handle}`}</p>
              <a
                href={profileUrl(platform, handle)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
              >
                @{handle} · {platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : "YouTube"} <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
          <UntrackButton id={id} />
        </div>
        <KpiTiles stats={stats} />
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{t("postsPerMonth")}</p>
          <MonthBars data={stats.postsPerMonth} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {stats.fetchedAt
            ? t("updated", { when: format.relativeTime(new Date(stats.fetchedAt)) })
            : refresh.error
              ? t("noData")
              : t("notYet")}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        {strip.length === 0 ? (
          <div className="grid h-full min-h-40 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            {t("noVideos")}
          </div>
        ) : (
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {strip.map((v) => (
              <div key={v.platformVideoId} className="w-44 shrink-0 snap-start">
                <OutlierCard video={v} />
              </div>
            ))}
            <Link
              href={detailHref}
              className="grid w-36 shrink-0 place-items-center rounded-xl border border-dashed text-center text-sm font-medium text-primary hover:bg-accent"
            >
              <span>
                {more > 0 ? t("moreVideos", { n: more }) : t("seeAccount")}
                <ArrowRight className="mx-auto mt-1 size-4" />
              </span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export function AccountRowSkeleton() {
  return (
    <div className="flex gap-4 rounded-3xl border bg-card p-4">
      <div className="w-72 space-y-3">
        <Skeleton className="h-11 w-40 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-16 rounded-xl" />
      </div>
      <div className="flex flex-1 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[9/14] w-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
