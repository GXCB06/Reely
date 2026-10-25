import Image from "next/image";
import darkLogo from "@/public/brand/reely-logo-dark.png";
import lightLogo from "@/public/brand/reely-logo-light.png";

/** Reely wordmark. `onDark` uses white letters for the dark sidebar. */
export function Logo({ onDark = false, height = 28 }: { onDark?: boolean; height?: number }) {
  const src = onDark ? darkLogo : lightLogo;
  return (
    <Image
      src={src}
      alt="Reely"
      height={height}
      style={{ width: "auto", height }}
      priority
    />
  );
}
