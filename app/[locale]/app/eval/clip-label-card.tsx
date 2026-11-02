"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ClipPlayer } from "@/components/clip-player";
import { PlatformIcon } from "@/components/platform-icon";
import type { EvalPlatform } from "@/lib/eval";

export type LabelBrief = { title: string; whatItIs: string; audience: string; goal: string | null; region: string; text?: string };
export type LabelClipView = { handle: string; caption: string; views: number | null; thumbnailUrl: string | null; platformVideoId: string; videoId: number; url: string };

/**
 * One clip to label blind: the brief, the clip (playable in place) and 2 / 1 / 0 with the judge's own rubric. Never
 * shows the AI's label. Used by the judge check and the labelling queue.
 */
export function ClipLabelCard({
  platform,
  brief,
  clip,
  pending,
  onAnswer,
  footer,
}: {
  platform: EvalPlatform;
  brief: LabelBrief;
  clip: LabelClipView;
  pending: boolean;
  onAnswer: (label: 0 | 1 | 2) => void;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("eval");
  const format = useFormatter();
  return (
    <article className="grid gap-4 rounded-3xl border bg-card p-4 md:grid-cols-[220px_1fr]">
      <div className="aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-2xl bg-muted">
        <ClipPlayer key={clip.videoId} platform={platform} platformVideoId={clip.platformVideoId} thumbnailUrl={clip.thumbnailUrl} videoId={clip.videoId} url={clip.url} />
      </div>
      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl bg-muted/60 p-3 text-xs">
          <p className="font-heading text-sm font-bold">{brief.title}</p>
          <p className="mt-0.5">{brief.whatItIs}</p>
          <p className="mt-0.5 text-muted-foreground">{[brief.audience, brief.goal, t(`region.${brief.region}`)].filter(Boolean).join(" · ")}</p>
          {brief.text && <p className="mt-1 line-clamp-3 text-muted-foreground">“{brief.text}”</p>}
        </div>
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <PlatformIcon platform={platform} /> @{clip.handle}
            {clip.views !== null && (
              <span className="text-xs font-normal text-muted-foreground">
                · {format.number(clip.views, { notation: "compact", maximumFractionDigits: 1 })} {t("check.views")}
              </span>
            )}
            <a href={clip.url} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-foreground" title={t("check.openClip")}>
              <ExternalLink className="size-3.5" />
            </a>
          </p>
          <p className="whitespace-pre-line text-sm">{clip.caption || t("check.noCaption")}</p>
        </div>
        <div className="space-y-2">
          {([2, 1, 0] as const).map((n) => (
            <button
              key={n}
              type="button"
              disabled={pending}
              onClick={() => onAnswer(n)}
              className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted font-bold">{n}</span>
              <span>{t(`check.rubric${n}`)}</span>
            </button>
          ))}
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {footer}
        </div>
      </div>
    </article>
  );
}
