import { Eye, Flame, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ScoredVideo } from "@/lib/search";
import { formatMultiplier } from "@/lib/scoring";

const LABEL_STYLE = {
  breakout: "bg-[var(--breakout)] text-white",
  strong: "bg-[var(--strong)] text-white",
  normal: "bg-white/90 text-foreground",
} as const;

function PlatformMark({ platform }: { platform: ScoredVideo["platform"] }) {
  const name = platform === "tiktok" ? "TikTok" : platform === "youtube" ? "Shorts" : "Reels";
  return <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">{name}</span>;
}

export async function OutlierCard({ video }: { video: ScoredVideo }) {
  const t = await getTranslations("search");
  const tl = await getTranslations("labels");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const headline = video.usual ?? video.reach;

  return (
    <article className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md">
      <a href={video.url} target="_blank" rel="noreferrer" className="relative block aspect-[9/14] bg-muted">
        {video.thumbnailUrl && (
          // Vendor thumbnails are short-lived signed URLs (some HEIC), so skip next/image optimisation.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        )}
        <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            <Eye className="size-3" /> {video.views !== null ? compact(video.views) : "–"}
          </span>
          {headline !== null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${LABEL_STYLE[video.label]}`}
              title={tl(video.label)}
            >
              <Flame className="size-3" /> {formatMultiplier(headline)}×
            </span>
          )}
        </div>
        <div className="absolute bottom-2 left-2">
          <PlatformMark platform={video.platform} />
        </div>
      </a>

      <div className="space-y-1.5 p-3">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{video.caption || "—"}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />@{video.creatorHandle}
          {video.creatorFollowers !== null && <> · {compact(video.creatorFollowers)} {t("followers")}</>}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
          {video.usual !== null && video.usualViews !== null && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
              {t("usual", { x: formatMultiplier(video.usual) })} · {t("usually", { views: compact(video.usualViews) })}
            </span>
          )}
          {video.reach !== null && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {t("reach", { x: formatMultiplier(video.reach) })}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
