import Image from "next/image";
import darkLogo from "@/public/brand/reely-logo-dark.png";
import lightLogo from "@/public/brand/reely-logo-light.png";
import mark from "@/public/brand/reely-mark.png";

/** Reely wordmark. `onDark` uses white letters for the dark sidebar; `markOnly` shows just the icon. */
export function Logo({ onDark = false, markOnly = false, height = 28 }: { onDark?: boolean; markOnly?: boolean; height?: number }) {
  const src = markOnly ? mark : onDark ? darkLogo : lightLogo;
  return <Image src={src} alt="Reely" height={height} style={{ width: "auto", height }} priority={!markOnly} />;
}
