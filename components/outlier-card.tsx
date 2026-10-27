import { Bookmark, Clapperboard, Eye, Flame, Heart, Layers, Lightbulb, MessageCircle, Music2, Share2, ShoppingBag, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlatformIcon } from "@/components/platform-icon";
import { SaveButton } from "@/components/save-button";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { CountryFlag } from "@/components/country-flag";
import { FeedbackButtons } from "@/components/feedback-buttons";
import type { Vote } from "@/lib/feedback";
import { engagementFactor, engagementRate, formatMultiplier, keepRate } from "@/lib/scoring";
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
  isNew = false,
  idea = null,
  feedback,
}: {
  video: ScoredVideo;
  saved?: boolean;
  variant?: "grid" | "carousel";
  /** Added by "update with new videos". */
  isNew?: boolean;
  /** How the user could use this clip for their product and goal (top 10 of a research). */
  idea?: string | null;
  /** 👍/👎 for the research's product (research pages only). */
  feedback?: { productId: string; vote: Vote | null };
}) {
  const t = await getTranslations("search");
  const tl = await getTranslations("labels");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const headline = video.usual ?? video.reach;
  const keep = keepRate(video);
  const engagement = engagementRate(video);
  const engagedX = engagementFactor(video);
  const href = video.dbId ? `/app/video/${video.dbId}` : null;
  const hook = (video.caption.split(/\n|#/)[0] || video.caption).trim();

  const rail = [
    { icon: Heart, value: video.likes },
    { icon: MessageCircle, value: video.comments },
    { icon: Bookmark, value: video.saves },
    { icon: Share2, value: video.shares },
  ].filter((r) => r.value !== null);

  const thumb = (
    <div className="relative aspect-[9/14] overflow-hidden bg-muted">
      <Thumb src={video.thumbnailUrl} videoId={video.dbId} className="transition group-hover:scale-[1.02]" />
      {/* Where it is from (top left), plus a TikTok Shop tag for affiliates. */}
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <span className="inline-flex h-5 items-center rounded-full bg-black/70 px-1.5">
          <CountryFlag country={video.country} caption={video.caption} />
        </span>
        {isNew && (
          <span className="inline-flex h-5 items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            {t("new")}
          </span>
        )}
        {video.hasShop && (
          <span title={t("shopTip")} className="inline-flex h-5 items-center gap-0.5 rounded-full bg-[#FE2C55] px-1.5 text-[10px] font-semibold text-white">
            <ShoppingBag className="size-3" /> {t("shop")}
          </span>
        )}
      </div>
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
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 py-0.5 pr-2 pl-0.5 text-[11px] font-medium text-white">
          <PlatformIcon platform={video.platform} className="size-4" /> {PLATFORM_NAME[video.platform]}
        </span>
      )}
    </div>
  );

  return (
    <article className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md">
      {href ? <Link href={href}>{thumb}</Link> : <a href={video.url} target="_blank" rel="noreferrer">{thumb}</a>}
      <div className="space-y-1.5 p-3">
        {variant === "grid" && <p className="line-clamp-2 text-sm leading-snug font-medium">{video.caption || "—"}</p>}
        {idea && (
          <p className="rounded-lg bg-primary/8 px-2 py-1.5 text-xs leading-snug text-foreground ring-1 ring-primary/15">
            <span className="mr-1 inline-flex items-center gap-0.5 font-semibold text-primary">
              <Lightbulb className="size-3" /> {t("ideaFor")}
            </span>
            {idea}
          </p>
        )}
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />@{video.creatorHandle}
          {video.creatorFollowers !== null && <> · {compact(video.creatorFollowers)} {t("followers")}</>}
          {variant === "carousel" && (
            <>
              {" "}· <PlatformIcon platform={video.platform} className="size-3.5" />
            </>
          )}
        </p>
        {variant === "grid" && video.sound && !video.sound.original && (
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground" title={video.sound.title}>
            <Music2 className="size-3 shrink-0" /> {video.sound.title}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
          {/* Most top clips are easy to film, so only the exceptions get a badge. */}
          {video.copyable === 0 && (
            <span title={t("hardToCopyTip")} className="inline-flex cursor-help items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
              <Clapperboard className="size-3" /> {t("hardToCopy")}
            </span>
          )}
          {video.usual !== null && video.usualViews !== null && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
              {t("usual", { x: formatMultiplier(video.usual) })} · {t("usually", { views: compact(video.usualViews) })}
            </span>
          )}
          {/* Engagement next to views: big views with nobody liking, commenting or saving is a weaker model. */}
          {engagement !== null && (
            <span
              title={t("engagementTip", { keep: keep !== null ? (keep * 100).toFixed(1) : "–", x: engagedX.toFixed(1) })}
              className={`cursor-help rounded-full px-2 py-0.5 ${engagedX >= 1.5 ? "bg-emerald-100 font-semibold text-emerald-900" : engagedX < 0.7 ? "bg-muted text-muted-foreground" : "bg-emerald-50 text-emerald-800"}`}
            >
              {t(engagedX >= 1.5 ? "engagementHigh" : "engagement", { p: (engagement * 100).toFixed(1) })}
            </span>
          )}
          {video.reach !== null && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {t("reach", { x: formatMultiplier(video.reach) })}
            </span>
          )}
        </div>
        {feedback && video.dbId && (
          <div className="border-t pt-1.5">
            <FeedbackButtons productId={feedback.productId} videoId={video.dbId} initialVote={feedback.vote} />
          </div>
        )}
        {video.dbId && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <Link
              href={`/app/format/${video.dbId}`}
              title={t("formatTip")}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Layers className="size-3.5" /> {t("format")}
            </Link>
            <SaveButton videoId={video.dbId} initialSaved={saved} />
          </div>
        )}
      </div>
    </article>
  );
}
