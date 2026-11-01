"use client";

import { CheckCircle2, Copy, Eye, FileText, Flame, PenLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/platform-icon";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { type AskClip, type AskHook, type AskScript, clipTotals, STANDOUT_MULTIPLIER } from "@/lib/ask";
import { formatMultiplier } from "@/lib/scoring";

function useCompact() {
  const format = useFormatter();
  return (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
}

/** A portrait clip card: views top left, multiplier top right, @handle over the bottom of the cover. */
function ClipCard({ clip, badge }: { clip: AskClip; badge?: string }) {
  const compact = useCompact();
  return (
    <Link href={`/app/video/${clip.dbId}`} className="group relative block aspect-[9/14] overflow-hidden rounded-2xl bg-muted">
      <Thumb src={clip.thumbnailUrl} videoId={clip.dbId} className="transition group-hover:scale-[1.03]" />
      <div className="absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1">
        {clip.views !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            <Eye className="size-3" /> {compact(clip.views)}
          </span>
        ) : (
          <span />
        )}
        {clip.multiplier !== null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
            <Flame className="size-3" /> {formatMultiplier(clip.multiplier)}×
          </span>
        )}
      </div>
      {badge && (
        <span className="absolute top-8 left-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5">
        <PlatformIcon platform={clip.platform} className="size-3" />
        <span className="truncate text-xs font-semibold text-white">@{clip.handle}</span>
      </div>
    </Link>
  );
}

/** Clips Reely picked (and the user's reference clip first, when there is one), with totals above. */
export function ClipGrid({ clips, reference }: { clips: AskClip[]; reference: AskClip | null }) {
  const t = useTranslations("results.ask");
  const compact = useCompact();
  if (!clips.length && !reference) return null;
  const totals = clipTotals(clips);
  return (
    <div className="space-y-2">
      {clips.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border bg-card px-2.5 py-1">
            <b>{compact(totals.views)}</b> {t("totalViews")}
          </span>
          {totals.standout > 0 && (
            <span className="rounded-full border bg-card px-2.5 py-1">
              <b>{totals.standout}</b> {t("standout", { x: STANDOUT_MULTIPLIER })}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {reference && <ClipCard clip={reference} badge={t("reference")} />}
        {clips.map((c) => (
          <ClipCard key={c.dbId} clip={c} />
        ))}
      </div>
    </div>
  );
}

/** Opening lines from the research's clips, each with what kind of hook and format it is. */
export function HookList({ hooks, onScript, busy }: { hooks: AskHook[]; onScript: (index: number) => void; busy: boolean }) {
  const t = useTranslations("results.ask");
  const compact = useCompact();
  return (
    <ol className="space-y-2">
      {hooks.map((h, i) => (
        <li key={`${h.clip.dbId}-${i}`} className="flex gap-3 rounded-2xl border bg-card p-2.5">
          <Link href={`/app/video/${h.clip.dbId}`} className="relative aspect-[9/14] w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
            <Thumb src={h.clip.thumbnailUrl} videoId={h.clip.dbId} />
          </Link>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm leading-snug font-semibold">
              <span className="mr-1 text-muted-foreground">{i + 1}.</span>“{h.hook}”
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {h.hookType && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary uppercase">{h.hookType}</span>}
              {h.format && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{h.format}</span>}
              <span className="text-muted-foreground">
                @{h.clip.handle}
                {h.clip.views !== null && <> · {t("views", { n: compact(h.clip.views) })}</>}
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onScript(i)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <PenLine className="size-3" /> {t("scriptFromHook")}
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A script written from one clip, already saved (it also shows on that clip's page). */
export function ScriptCard({ script }: { script: AskScript }) {
  const t = useTranslations("results.ask");
  const ts = useTranslations("script");
  const compact = useCompact();
  const text = [
    script.title,
    "",
    ...script.beats.map((b) => `[${b.time}] ${ts(`beat.${b.label}`)}\n${b.voiceover}${b.onScreen ? `\n${ts("onScreen")}: ${b.onScreen}` : ""}\n${ts("shot")}: ${b.visual}`),
  ].join("\n");

  return (
    <div className="space-y-3 rounded-3xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold tracking-widest text-muted-foreground uppercase">
          <FileText className="size-3.5" /> {t("script")}
        </span>
        {script.id && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="size-3.5" /> {t("saved")}
          </span>
        )}
      </div>
      <div className="flex gap-3">
        <Link href={`/app/video/${script.clip.dbId}`} className="relative aspect-[9/14] w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
          <Thumb src={script.clip.thumbnailUrl} videoId={script.clip.dbId} />
        </Link>
        <div className="min-w-0 space-y-1.5">
          <p className="font-heading text-lg leading-tight font-bold">{script.title}</p>
          <p className="text-xs text-muted-foreground">
            {t("builtFrom", { handle: script.clip.handle })}
            {script.clip.views !== null && <> · {t("views", { n: compact(script.clip.views) })}</>}
          </p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-muted px-2 py-0.5">{t("seconds", { n: script.durationSeconds })}</span>
            {script.hookType && <span className="rounded-full bg-muted px-2 py-0.5">{script.hookType}</span>}
            {script.format && <span className="rounded-full bg-muted px-2 py-0.5">{script.format}</span>}
          </div>
        </div>
      </div>
      <ol className="space-y-1.5">
        {script.beats.map((b, i) => (
          <li key={i} className={`grid grid-cols-[4.5rem_2.5rem_1fr] gap-2 rounded-xl px-3 py-2 text-sm ${i === 0 ? "bg-primary/10" : "bg-muted/60"}`}>
            <span className={`text-[11px] font-bold tracking-wide uppercase ${i === 0 ? "text-primary" : "text-muted-foreground"}`}>{ts(`beat.${b.label}`)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{b.time}</span>
            <span className="min-w-0 space-y-0.5">
              <span className="block">{b.voiceover}</span>
              {b.onScreen && (
                <span className="block text-xs text-muted-foreground">
                  {ts("onScreen")}: {b.onScreen}
                </span>
              )}
              <span className="block text-xs text-muted-foreground">
                {ts("shot")}: {b.visual}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => toast.success(ts("copied")),
              () => toast.error(ts("error")),
            )
          }
          className="chip"
        >
          <Copy className="size-3.5" /> {ts("copy")}
        </button>
        <Link href={`/app/video/${script.clip.dbId}`} className="chip">
          <PenLine className="size-3.5" /> {t("openClip")}
        </Link>
      </div>
    </div>
  );
}
