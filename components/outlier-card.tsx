import { Bookmark, Eye, Flame, Heart, MessageCircle, Share2, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { SaveButton } from "@/components/save-button";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { RegionIcon } from "@/components/chat/region-flag";
import { looksThai } from "@/lib/region";
import { formatMultiplier } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";

const LABEL_STYLE = {
  breakout: "bg-[var(--breakout)] text-white",
  strong: "bg-[var(--strong)] text-white",
  normal: "bg-white/90 text-foreground",
} as const;

const PLATFORM_NAME = { tiktok: "TikTok", youtube: "Shorts", instagram: "Reels" } as const;

/** Outlier video card: views + multiplier on top, engagement rail on the right edge, creator and scores below. */
export async function OutlierCard({
  video,
  saved = false,
  variant = "grid",
}: {
  video: ScoredVideo;
  saved?: boolean;
  variant?: "grid" | "carousel";
}) {
  const t = await getTranslations("search");
  const tl = await getTranslations("labels");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const headline = video.usual ?? video.reach;
  const href = video.dbId ? `/app/video/${video.dbId}` : null;
  const hook = (video.caption.split(/\n|#/)[0] || video.caption).trim();
  // Caption language as a quick hint of where the video is from.
  const flag = video.caption ? <RegionIcon region={looksThai(video.caption) ? "th" : "global"} /> : null;

  const rail = [
    { icon: Heart, value: video.likes },
    { icon: MessageCircle, value: video.comments },
    { icon: Bookmark, value: video.saves },
    { icon: Share2, value: video.shares },
  ].filter((r) => r.value !== null);

  const thumb = (
    <div className="relative aspect-[9/14] overflow-hidden bg-muted">
      <Thumb src={video.thumbnailUrl} className="transition group-hover:scale-[1.02]" />
      {/* Views and 🔥 sit together (Virlo-style); the tooltip shows how the 🔥 number was worked out. */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
          <Eye className="size-3" /> {video.views !== null ? compact(video.views) : "–"}
        </span>
        {headline !== null && (
          <span
            className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${LABEL_STYLE[video.label]}`}
            title={
              video.usual !== null && video.usualViews !== null && video.views !== null
                ? t("fireUsualTip", { views: compact(video.views), usual: compact(video.usualViews), x: formatMultiplier(video.usual), label: tl(video.label) })
                : t("fireReachTip", {
                    views: video.views !== null ? compact(video.views) : "–",
                    followers: video.creatorFollowers !== null ? compact(video.creatorFollowers) : "–",
                    x: formatMultiplier(headline),
                    label: tl(video.label),
                  })
            }
          >
            <Flame className="size-3" /> {formatMultiplier(headline)}×
          </span>
        )}
      </div>
      {variant === "grid" && rail.length > 0 && (
        <div className="absolute right-2 bottom-12 flex flex-col gap-2 rounded-full bg-black/55 px-1.5 py-2 text-[10px] font-semibold text-white">
          {rail.map(({ icon: Icon, value }, i) => (
            <span key={i} className="flex flex-col items-center gap-0.5">
              <Icon className="size-3" />
              {compact(value!)}
            </span>
          ))}
        </div>
      )}
      {variant === "carousel" && hook && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10">
          <p className="line-clamp-2 text-sm font-semibold text-white">“{hook}”</p>
        </div>
      )}
      {variant === "grid" && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
          {PLATFORM_NAME[video.platform]} {flag}
        </span>
      )}
    </div>
  );

  return (
    <article className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md">
      {href ? <Link href={href}>{thumb}</Link> : <a href={video.url} target="_blank" rel="noreferrer">{thumb}</a>}
      <div className="space-y-1.5 p-3">
        {variant === "grid" && <p className="line-clamp-2 text-sm leading-snug font-medium">{video.caption || "—"}</p>}
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />@{video.creatorHandle}
          {video.creatorFollowers !== null && <> · {compact(video.creatorFollowers)} {t("followers")}</>}
          {variant === "carousel" && <> · {PLATFORM_NAME[video.platform]} {flag}</>}
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
        {video.dbId && (
          <div className="flex justify-end pt-1">
            <SaveButton videoId={video.dbId} initialSaved={saved} />
          </div>
        )}
      </div>
    </article>
  );
}
