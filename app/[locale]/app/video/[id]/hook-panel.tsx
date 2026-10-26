"use client";

import { AudioLines, ChevronDown, Loader2, Megaphone, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { HookBreakdown } from "@/lib/ai/schemas";
import { looksThai } from "@/lib/region";
import { clock, type Segment, speechStats } from "@/lib/transcript";
import { readHookAction } from "./actions";

type Status = "idle" | "reading" | "none" | "tooLong" | "limit" | "failed";

const BEAT_COLOR: Record<HookBreakdown["beats"][number]["label"], string> = {
  hook: "bg-primary",
  setup: "bg-violet-300",
  problem: "bg-rose-300",
  demo: "bg-sky-300",
  proof: "bg-emerald-300",
  story: "bg-amber-300",
  twist: "bg-fuchsia-300",
  payoff: "bg-teal-300",
  cta: "bg-slate-400",
};

/**
 * The real hook: the clip's first ~3 seconds as actually spoken, its parts with timing, and the full transcript.
 * Read on request (1 credit the first time anyone reads this clip), then cached for everyone.
 */
export function HookPanel({
  videoId,
  duration,
  initial,
}: {
  videoId: number;
  duration: number | null;
  initial: { segments: Segment[]; breakdown: HookBreakdown | null } | "none" | null;
}) {
  const t = useTranslations("hook");
  const locale = useLocale();
  const [view, setView] = useState(initial && initial !== "none" ? initial : null);
  const [status, setStatus] = useState<Status>(initial === "none" ? "none" : "idle");

  async function read() {
    setStatus("reading");
    const res = await readHookAction(videoId, locale).catch(() => null);
    if (!res) return setStatus("failed");
    if (!res.ok) return setStatus(res.error);
    setView(res.view);
    setStatus("idle");
  }

  if (status === "none" || status === "tooLong") {
    return <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">{t(status)}</p>;
  }

  if (!view) {
    return (
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
        {status === "reading" ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="size-4 animate-spin" /> {t("reading")}
          </p>
        ) : (
          <>
            {(status === "limit" || status === "failed") && <p className="mt-3 text-sm text-destructive">{t(status)}</p>}
            <button
              type="button"
              onClick={read}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <AudioLines className="size-4" /> {t("read")}
            </button>
          </>
        )}
      </div>
    );
  }

  const b = view.breakdown;
  const stats = speechStats(view.segments, duration);
  const total = Math.max(stats?.duration ?? 0, b?.beats.at(-1)?.end ?? 0, 1);
  // A translation only helps when the clip speaks another language than the user's.
  const hook = b?.hook || view.segments[0]?.text || "";
  const translated = b?.hookTranslated?.trim() && (locale === "th") !== looksThai(hook) ? b.hookTranslated : null;

  return (
    <div className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("firstSeconds")}</p>
        <blockquote className="mt-1 font-heading text-2xl leading-snug font-bold">“{hook}”</blockquote>
        {translated && <p className="mt-1 text-muted-foreground">{translated}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {b?.hookType && <span className="rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground">{b.hookType}</span>}
          {stats && <span className="rounded-full bg-muted px-2.5 py-1">{t("startsAt", { s: stats.startsAt.toFixed(1) })}</span>}
          {stats && <span className="rounded-full bg-muted px-2.5 py-1">{t("talkShare", { p: Math.round(stats.talkShare * 100) })}</span>}
          {stats && <span className="rounded-full bg-muted px-2.5 py-1">{t("length", { t: clock(stats.duration) })}</span>}
        </div>
        {b?.hookWhy && <p className="mt-3 leading-relaxed">{b.hookWhy}</p>}
      </div>

      {b ? (
        <div>
          <p className="mb-2 text-sm font-semibold">{t("structure")}</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {b.beats.map((beat, i) => (
              <span
                key={i}
                title={`${t(`beat.${beat.label}`)} ${clock(beat.start)}-${clock(beat.end)}`}
                className={`${BEAT_COLOR[beat.label]} border-r border-card last:border-r-0`}
                style={{ width: `${(Math.max(0.5, beat.end - beat.start) / total) * 100}%` }}
              />
            ))}
          </div>
          <ol className="mt-3 space-y-1.5 text-sm">
            {b.beats.map((beat, i) => (
              <li key={i} className="grid grid-cols-[92px_1fr] gap-2">
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <span className={`size-2 shrink-0 rounded-full ${BEAT_COLOR[beat.label]}`} />
                  {clock(beat.start)}–{clock(beat.end)}
                </span>
                <span>
                  <span className="font-semibold">{t(`beat.${beat.label}`)}</span> · {beat.summary}
                </span>
              </li>
            ))}
          </ol>
          {b.cta && b.cta !== "none" && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm">
              <Megaphone className="size-4 shrink-0 text-primary" /> <span className="font-semibold">{t("cta")}</span> {b.cta}
            </p>
          )}
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("analysisFailed")}
          <button type="button" onClick={read} className="chip">
            <RotateCcw className="size-3.5" /> {t("retry")}
          </button>
        </p>
      )}

      <details className="group rounded-2xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium">
          {t("transcript")}
          <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
        </summary>
        <ol className="max-h-72 space-y-1 overflow-y-auto border-t px-4 py-3 text-sm">
          {view.segments.map((s, i) => (
            <li key={i} className="grid grid-cols-[44px_1fr] gap-2">
              <span className="font-mono text-xs text-muted-foreground">{clock(s.start)}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
