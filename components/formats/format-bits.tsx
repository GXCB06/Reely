import { getTranslations } from "next-intl/server";
import type { FormatStage } from "@/lib/format-stats";

const STAGE_STYLE: Record<FormatStage, string> = {
  fresh: "bg-sky-100 text-sky-800",
  rising: "bg-emerald-100 text-emerald-800",
  steady: "bg-muted text-muted-foreground",
  fading: "bg-amber-100 text-amber-800",
};

/** Where a format is in its life: fresh / rising / steady / fading. */
export async function StageBadge({ stage }: { stage: FormatStage }) {
  const t = await getTranslations("format");
  return (
    <span title={t(`stageTip.${stage}`)} className={`inline-flex cursor-help items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAGE_STYLE[stage]}`}>
      <span className="size-1.5 rounded-full bg-current" /> {t(`stage.${stage}`)}
    </span>
  );
}

/** Videos posted per day (last 30 days) as simple bars; the peak day is labelled. */
export async function PerDayChart({ perDay }: { perDay: { day: string; count: number }[] }) {
  const t = await getTranslations("format");
  const max = Math.max(1, ...perDay.map((d) => d.count));
  const peak = perDay.reduce((p, d) => (d.count > p.count ? d : p), perDay[0] ?? { day: "", count: 0 });
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={t("perDayLabel", { peak: peak.count, day: peak.day })}>
        {perDay.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.count}`}
            className={`flex-1 rounded-t-sm ${d.day === peak.day && d.count ? "bg-primary" : "bg-primary/35"}`}
            style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{perDay[0]?.day.slice(5)}</span>
        {peak.count > 0 && <span>{t("peak", { n: peak.count, day: peak.day.slice(5) })}</span>}
        <span>{perDay[perDay.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}
