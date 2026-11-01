"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";

// The page the user was on before this one, in this tab. Kept in memory only: a reload or a new tab starts empty,
// so "back" then falls back to a link instead of leaving Reely.
let previous: string | null = null;
let current: string | null = null;

/** Remembers the previous in-app page (mounted once in the app layout). */
export function NavMemory() {
  const pathname = usePathname();
  useEffect(() => {
    const here = pathname + window.location.search;
    if (here === current) return;
    previous = current;
    current = here;
  }, [pathname]);
  return null;
}

type Place = "results" | "saved" | "tracking" | "plan" | "today" | "other";

function placeOf(path: string): Place {
  const p = path.replace(/^\/(th|en)(?=\/)/, "");
  if (p.startsWith("/app/research/")) return "results";
  if (p.startsWith("/app/saved")) return "saved";
  if (p.startsWith("/app/tracking")) return "tracking";
  if (p.startsWith("/app/plan")) return "plan";
  if (p.startsWith("/app/today")) return "today";
  return "other";
}

/**
 * "Back" on a detail page: returns to the page the user came from (results keep their filters and scroll), or, when
 * the page was opened directly, links to `fallbackHref`.
 */
export function BackLink({ fallbackHref, fallbackLabel }: { fallbackHref: string; fallbackLabel: string }) {
  const t = useTranslations("backTo");
  const router = useRouter();
  // Read after mount: the server can't know the previous page, so the first render matches the fallback.
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    // This effect runs before NavMemory's (children first), so `current` may still be the page we came from.
    const here = window.location.pathname + window.location.search;
    const came = current && current !== here ? current : previous && previous !== here ? previous : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom(came);
  }, []);

  const className = "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground";
  if (!from) {
    return (
      <Link href={fallbackHref} className={className}>
        <ArrowLeft className="size-4" /> {fallbackLabel}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      <ArrowLeft className="size-4" /> {t(placeOf(from))}
    </button>
  );
}
