import { Flame, HelpCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BREAKOUT_AT, STRONG_AT } from "@/lib/scoring";

/** "What does 🔥 mean?" — a short, expandable explanation shown above result grids. */
export async function ScoreExplainer() {
  const t = await getTranslations("score");
  return (
    <details className="group rounded-2xl border bg-card px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <HelpCircle className="size-4 text-primary" />
        {t("question")}
        <span className="ml-auto text-xs text-muted-foreground group-open:hidden">{t("show")}</span>
      </summary>
      <div className="mt-3 space-y-2 text-muted-foreground">
        <p>
          <Flame className="mr-1 inline size-3.5 text-[var(--breakout)]" />
          {t("usual")}
        </p>
        <p className="rounded-xl bg-muted px-3 py-2 font-mono text-xs text-foreground">{t("example")}</p>
        <p>{t("reach")}</p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <span className="rounded-full bg-[var(--breakout)] px-2 py-0.5 font-bold text-white">{t("breakout", { n: BREAKOUT_AT })}</span>
          <span className="rounded-full bg-[var(--strong)] px-2 py-0.5 font-bold text-white">{t("strong", { from: STRONG_AT, to: BREAKOUT_AT })}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-foreground">{t("normal", { n: STRONG_AT })}</span>
        </div>
        <p className="text-xs">{t("caveat")}</p>
      </div>
    </details>
  );
}
