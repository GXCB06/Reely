import { Flame, Package } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlatformIcon } from "@/components/platform-icon";
import { Thumb } from "@/components/thumb";
import { TrackButton } from "@/components/tracking/track-button";
import { Link } from "@/i18n/navigation";
import { formatMultiplier } from "@/lib/scoring";
import type { SuggestedAccount } from "@/lib/tracking-suggestions";

/** Account cards with a Track button: suggestions from the user's researches, or search matches. */
export async function SuggestedAccounts({ accounts }: { accounts: SuggestedAccount[] }) {
  const t = await getTranslations("tracking");
  const format = await getFormatter();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => (
        <article key={`${a.platform}:${a.handle}`} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-sm">
          {a.best ? (
            <Link href={`/app/video/${a.best.id}`} className="relative aspect-[9/14] w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              <Thumb src={a.best.thumbnailUrl} videoId={a.best.id} />
            </Link>
          ) : (
            <div className="grid aspect-[9/14] w-14 shrink-0 place-items-center rounded-xl bg-muted">
              <PlatformIcon platform={a.platform} className="size-6" />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <PlatformIcon platform={a.platform} className="size-4 shrink-0" /> @{a.handle}
            </p>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {a.similar && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  <Package className="size-3" /> {t("similarProduct")}
                </span>
              )}
              {a.usualViews !== null && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t("usualViews", { views: compact(a.usualViews) })}</span>}
              {a.best?.usual != null && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
                  <Flame className="size-3" /> {formatMultiplier(a.best.usual)}×
                </span>
              )}
              {a.hits > 1 && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t("hits", { n: a.hits })}</span>}
            </div>
            <div className="mt-auto">
              <TrackButton platform={a.platform} handle={a.handle} initialTracked={false} refresh />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
