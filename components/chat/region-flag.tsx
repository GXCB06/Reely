import { Globe } from "lucide-react";
import type { RegionChoice } from "@/lib/region";

/** Thai flag drawn as SVG: Windows doesn't render flag emojis (🇹🇭 shows as "TH"). */
function ThaiFlag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 6" aria-hidden className={`inline-block h-[0.7em] w-auto shrink-0 rounded-[1px] align-[-0.05em] ${className}`}>
      <rect width="9" height="6" fill="#A51931" />
      <rect y="1" width="9" height="4" fill="#F4F5F8" />
      <rect y="2" width="9" height="2" fill="#2D2A4A" />
    </svg>
  );
}

/** 🇹🇭 / 🌏 / both, as icons that render on every OS. */
export function RegionIcon({ region, className = "" }: { region: RegionChoice; className?: string }) {
  if (region === "th") return <ThaiFlag className={className} />;
  if (region === "global") return <Globe aria-hidden className={`inline-block size-[1em] shrink-0 text-sky-600 ${className}`} />;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <ThaiFlag />
      <Globe aria-hidden className="inline-block size-[1em] text-sky-600" />
    </span>
  );
}
