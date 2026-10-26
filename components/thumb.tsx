"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { repairCover } from "./cover-repair";

/**
 * Video thumbnail. Covers are copied to storage when found, but older ones may still point at vendor links that
 * expired (TikTok/Instagram sign them for a few hours). With `videoId`, a cover that fails asks the server to
 * repair it once (fresh link, copied to storage); until then, and if that fails, a branded placeholder shows.
 */
export function Thumb({ src, videoId, className = "" }: { src: string | null; videoId?: number; className?: string }) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(!src);
  const ref = useRef<HTMLImageElement>(null);

  function onFail() {
    setFailed(true);
    if (!videoId) return;
    void repairCover(videoId).then((url) => {
      if (!url) return;
      setCurrent(url);
      setFailed(false);
    });
  }

  // A server-rendered <img> can fail before React hydrates and attaches onError, so check once mounted.
  useEffect(() => {
    const img = ref.current;
    if (!src || (img?.complete && img.naturalWidth === 0)) onFail();
    // Only on mount: later failures arrive through onError.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed || !current) {
    return (
      <div className={`grid size-full place-items-center bg-gradient-to-br from-primary/80 to-primary/40 ${className}`}>
        <Play className="size-8 text-white/80" fill="currentColor" />
      </div>
    );
  }
  return (
    // Vendor thumbnails are short-lived signed URLs (some HEIC), so skip next/image optimisation.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={current}
      alt=""
      loading="lazy"
      // Instagram's CDN refuses some hotlinked images that send a Referer.
      referrerPolicy="no-referrer"
      onError={onFail}
      className={`size-full object-cover ${className}`}
    />
  );
}
