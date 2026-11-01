"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { ClipPlayer } from "@/components/clip-player";
import { PlatformIcon } from "@/components/platform-icon";
import { useRouter } from "@/i18n/navigation";
import type { CheckItem } from "@/lib/eval-check";
import { setBlindLabelAction } from "../actions";

/** One clip of the judge check: the brief, the clip, and 2 / 1 / 0 with the judge's own rubric. The AI's label stays hidden. */
export function CheckCard({ item }: { item: CheckItem }) {
  const t = useTranslations("eval");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();

  function answer(label: 0 | 1 | 2) {
    start(async () => {
      const res = await setBlindLabelAction(item.runId, item.item, item.platform, label);
      if (!res.ok) return void toast.error(t("check.notSaved"));
      router.refresh();
    });
  }

  return (
    <article className="grid gap-4 rounded-3xl border bg-card p-4 md:grid-cols-[220px_1fr]">
      <div className="aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-2xl bg-muted">
        <ClipPlayer platform={item.platform} platformVideoId={item.clip.platformVideoId} thumbnailUrl={item.clip.thumbnailUrl} videoId={item.clip.videoId} />
      </div>
      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl bg-muted/60 p-3 text-xs">
          <p className="font-heading text-sm font-bold">{item.brief.title}</p>
          <p className="mt-0.5">{item.brief.whatItIs}</p>
          <p className="mt-0.5 text-muted-foreground">
            {[item.brief.audience, item.brief.goal, t(`region.${item.brief.region}`)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <PlatformIcon platform={item.platform} /> @{item.clip.handle}
            {item.clip.views !== null && (
              <span className="text-xs font-normal text-muted-foreground">
                · {format.number(item.clip.views, { notation: "compact", maximumFractionDigits: 1 })} {t("check.views")}
              </span>
            )}
            <a href={item.clip.url} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-foreground" title={t("check.openClip")}>
              <ExternalLink className="size-3.5" />
            </a>
          </p>
          <p className="whitespace-pre-line text-sm">{item.clip.caption || t("check.noCaption")}</p>
        </div>
        <div className="space-y-2">
          {([2, 1, 0] as const).map((n) => (
            <button
              key={n}
              type="button"
              disabled={pending}
              onClick={() => answer(n)}
              className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted font-bold">{n}</span>
              <span>{t(`check.rubric${n}`)}</span>
            </button>
          ))}
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </div>
    </article>
  );
}
