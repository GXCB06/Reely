"use client";

import { ChevronLeft, ChevronRight, ExternalLink, PenLine, Quote } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ClipPlayer } from "@/components/clip-player";
import { Link } from "@/i18n/navigation";

export type PlanDay = {
  day: number;
  weekday: string;
  dayNum: string;
  longDate: string;
  isToday: boolean;
  title: string;
  hook: string;
  format: string;
  why: string;
  videoId: number;
  thumbnailUrl: string | null;
  handle: string | null;
  platform: "tiktok" | "youtube" | "instagram" | null;
  platformVideoId: string | null;
  url: string | null;
};

/**
 * The week as tabs: tap a day and its post shows below (no jumping down a long page). Starts on today, or day 1.
 * Each day plays its reference clip right here.
 */
export function PlanDays({ days, productId }: { days: PlanDay[]; productId: string }) {
  const t = useTranslations("plan");
  const [selected, setSelected] = useState(days.find((d) => d.isToday)?.day ?? days[0]?.day ?? 1);
  const index = Math.max(0, days.findIndex((d) => d.day === selected));
  const d = days[index];
  if (!d) return null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("week")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-7 md:px-0">
        {days.map((x) => {
          const on = x.day === selected;
          return (
            <button
              key={x.day}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelected(x.day)}
              className={`relative min-w-20 shrink-0 rounded-2xl border px-2 py-2 text-center transition md:min-w-0 ${
                on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/40"
              }`}
            >
              {x.isToday && <span className={`absolute top-1.5 right-1.5 size-1.5 rounded-full ${on ? "bg-primary-foreground" : "bg-primary"}`} />}
              <span className="block text-[11px] font-semibold tracking-wide uppercase opacity-80">{x.isToday ? t("today") : x.weekday}</span>
              <span className="block font-heading text-lg leading-tight font-bold">{x.dayNum}</span>
              <span className="block truncate text-[11px] opacity-80">{x.format}</span>
            </button>
          );
        })}
      </div>

      <article role="tabpanel" className="grid gap-5 rounded-3xl border bg-card p-4 shadow-sm md:grid-cols-[220px_1fr] md:p-6">
        <div className="mx-auto w-full max-w-56 md:max-w-none">
          <div className="aspect-[9/14] overflow-hidden rounded-2xl bg-muted">
            <ClipPlayer
              key={d.videoId}
              platform={d.platform}
              platformVideoId={d.platformVideoId}
              thumbnailUrl={d.thumbnailUrl}
              videoId={d.videoId}
            />
          </div>
          {d.handle && <p className="mt-2 text-center text-xs text-muted-foreground">{t("from", { handle: d.handle })}</p>}
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            {t("day", { n: d.day })} · {d.longDate}
            {d.isToday && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground normal-case">{t("today")}</span>}
          </p>
          <h3 className="mt-1 font-heading text-xl leading-snug font-bold md:text-2xl">{d.title}</h3>
          <p className="mt-3 flex gap-2 rounded-2xl bg-accent px-3 py-2.5 text-sm text-accent-foreground">
            <Quote className="mt-0.5 size-4 shrink-0" /> {d.hook}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="mr-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{d.format}</span>
            {d.why}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/app/video/${d.videoId}?product=${productId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <PenLine className="size-4" /> {t("writeScript")}
            </Link>
            {d.url && (
              <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm hover:bg-muted">
                <ExternalLink className="size-4" /> {t("openOriginal")}
              </a>
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-5">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setSelected(days[index - 1].day)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="size-4" /> {t("prevDay")}
            </button>
            <span className="text-xs text-muted-foreground">
              {index + 1} / {days.length}
            </span>
            <button
              type="button"
              disabled={index === days.length - 1}
              onClick={() => setSelected(days[index + 1].day)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              {t("nextDay")} <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
