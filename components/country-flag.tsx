import * as Flags from "country-flag-icons/react/3x2";
import { Globe } from "lucide-react";
import { looksThai } from "@/lib/region";

type FlagComponent = (props: { title?: string; className?: string }) => React.ReactElement;

/**
 * Where a video is from: the post's country (TikTok) or channel's country (YouTube) as a real flag.
 * When unknown, falls back to the caption: Thai script → Thai flag, otherwise a globe.
 * SVG flags because Windows does not render flag emojis.
 */
export function CountryFlag({ country, caption, className = "h-3 w-auto" }: { country: string | null; caption: string; className?: string }) {
  const code = country?.toUpperCase();
  const Flag = code ? (Flags as unknown as Record<string, FlagComponent | undefined>)[code] : undefined;
  if (Flag) return <Flag title={code} className={`rounded-[2px] ${className}`} />;
  if (looksThai(caption)) return <Flags.TH title="TH" className={`rounded-[2px] ${className}`} />;
  return caption ? <Globe aria-hidden className="size-3 text-sky-300" /> : null;
}
