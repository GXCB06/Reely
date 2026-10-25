"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Video thumbnail. TikTok thumbnail URLs are signed and expire after a few hours, so older
 * cached videos fall back to a branded placeholder instead of a broken image.
 */
export function Thumb({ src, className = "" }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(!src);
  const ref = useRef<HTMLImageElement>(null);

  // A server-rendered <img> can fail before React hydrates and attaches onError, so check once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
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
      src={src!}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`size-full object-cover ${className}`}
    />
  );
}
