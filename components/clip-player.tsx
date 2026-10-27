"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { embedUrl, type EmbedPlatform } from "@/lib/embed";
import { Thumb } from "./thumb";

/** Height of the profile bar at the top of Instagram's post embed. */
const IG_HEADER_PX = 54;

/**
 * A clip that plays inside Reely: the cover with a play button; pressing it swaps in the platform's own player
 * (with sound). Falls back to the cover when the clip can't be embedded.
 */
export function ClipPlayer({
  platform,
  platformVideoId,
  thumbnailUrl,
  videoId,
}: {
  platform: EmbedPlatform | null;
  platformVideoId: string | null;
  thumbnailUrl: string | null;
  videoId?: number;
}) {
  const t = useTranslations("card");
  const [playing, setPlaying] = useState(false);
  const src = platform && platformVideoId ? embedUrl(platform, platformVideoId) : null;

  if (playing && src && platform === "instagram") {
    // Instagram's embed is a whole post (profile header, likes, comments). Show only its video: the media is a 4:5
    // box right under a 54 px header (measured 2026-10-27), so shift the frame up and clip everything else.
    return (
      <div className="flex size-full items-center bg-black">
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          <iframe
            src={src}
            title={t("play")}
            scrolling="no"
            className="absolute border-0"
            // 1 px more on each side hides the embed's own white border.
            style={{ top: -IG_HEADER_PX - 1, left: -1, width: "calc(100% + 2px)", height: `calc(100% + ${IG_HEADER_PX + 400}px)` }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          />
        </div>
      </div>
    );
  }
  if (playing && src) {
    return (
      <iframe
        src={src}
        title={t("play")}
        className="size-full border-0 bg-black"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <div className="relative size-full">
      <Thumb src={thumbnailUrl} videoId={videoId} />
      {src && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t("play")}
          className="absolute inset-0 grid place-items-center bg-black/10 transition hover:bg-black/25"
        >
          <span className="grid size-14 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
            <Play className="ml-0.5 size-6" fill="currentColor" />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Card cover that starts playing (muted) when the mouse rests on it, like a feed. Only on devices with a mouse,
 * after a short pause so sweeping across the grid doesn't load every player. Instagram stays a cover.
 */
export function HoverPreview({
  platform,
  platformVideoId,
  children,
}: {
  platform: EmbedPlatform;
  platformVideoId: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const src = embedUrl(platform, platformVideoId, true);
  if (!src) return <>{children}</>;

  return (
    <div
      className="relative size-full"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setTimer(setTimeout(() => setActive(true), 450));
      }}
      onPointerLeave={() => {
        if (timer) clearTimeout(timer);
        setTimer(null);
        setActive(false);
      }}
    >
      {children}
      {active && (
        // The player sits under the card's own overlays (views, multiplier) and never takes the click: the card
        // still opens the video page.
        <iframe
          src={src}
          title=""
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full border-0 bg-black"
          allow="autoplay; encrypted-media"
        />
      )}
    </div>
  );
}
