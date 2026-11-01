"use client";

import { Gavel, Loader2, Repeat2, Star, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/platform-icon";
import { Thumb } from "@/components/thumb";
import { Link, useRouter } from "@/i18n/navigation";
import type { EvalPlatform, Label } from "@/lib/eval";
import { judgeBriefAction, rerunBriefAction, setCoreAction, setHoldoutAction, setInTestSetAction, setLabelAction } from "./actions";

export type EvalItem = {
  item: string;
  kind: "clip" | "creator";
  platform: EvalPlatform;
  /** Clips: the video id; creators: null. */
  videoId: number | null;
  handle: string;
  thumbnailUrl: string | null;
  label: Label | null;
  reason: string;
  corrected: boolean;
};

export type BriefView = {
  runId: string;
  title: string;
  brief: string;
  region: string;
  goal: string | null;
  core: boolean;
  /** Measured with every change, never tuned on. */
  holdout: boolean;
  /** The original brief's title when this research is a re-run of it. */
  rerunOf: string | null;
  judged: boolean;
  lists: { platform: EvalPlatform; clips: EvalItem[]; creators: EvalItem[] }[];
  line: string;
};

const LABEL_STYLE: Record<Label, string> = {
  2: "bg-emerald-100 text-emerald-800 border-emerald-300",
  1: "bg-amber-100 text-amber-800 border-amber-300",
  0: "bg-rose-100 text-rose-800 border-rose-300",
};

/** 2 / 1 / 0 for one clip or creator. Tapping a label corrects the AI; tapping your own correction again removes it. */
function LabelPicker({ runId, it }: { runId: string; it: EvalItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-0.5" title={it.reason}>
      {([2, 1, 0] as Label[]).map((n) => (
        <button
          key={n}
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setLabelAction(runId, it.item, it.kind, it.platform, it.corrected && it.label === n ? null : n);
              if (!res.ok) toast.error("Not saved");
              router.refresh();
            })
          }
          className={`grid size-6 place-items-center rounded-md border text-[11px] font-bold ${
            it.label === n ? `${LABEL_STYLE[n]} ${it.corrected ? "ring-2 ring-foreground/40" : ""}` : "border-transparent text-muted-foreground hover:bg-muted"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** One test brief: its top clips and creators per platform with labels, and its own metric line. */
export function BriefCard({ view }: { view: BriefView }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const locale = useLocale();
  const [judging, startJudge] = useTransition();
  const [rerunning, startRerun] = useTransition();
  const [pending, start] = useTransition();

  function rerun() {
    if (!window.confirm(t("rerunConfirm"))) return;
    startRerun(async () => {
      const res = await rerunBriefAction(view.runId, locale);
      if (!res.ok) return void toast.error(t(res.error === "noGoal" ? "rerunNoGoal" : "rerunFailed"));
      toast.success(t("rerunDone"));
      router.refresh();
    });
  }

  function judge() {
    startJudge(async () => {
      const res = await judgeBriefAction(view.runId);
      if (!res.ok) toast.error(t("judgeFailed"));
      else toast.success(t("judged", { n: res.judged ?? 0 }));
      router.refresh();
    });
  }

  return (
    <article id={`brief-${view.runId}`} className="space-y-3 rounded-3xl border bg-card p-4">
      <header className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await setCoreAction(view.runId, !view.core), router.refresh()))}
          title={t("coreTip")}
          className={view.core ? "text-amber-500" : "text-muted-foreground/50 hover:text-amber-500"}
        >
          <Star className="size-4" fill={view.core ? "currentColor" : "none"} />
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/app/research/${view.runId}`} className="font-heading font-bold hover:underline">
            {view.title}
          </Link>
          {!view.rerunOf && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await setHoldoutAction(view.runId, !view.holdout), router.refresh()))}
              title={t("holdoutTip")}
              className={`mr-2 rounded-full border px-2 py-0.5 text-[10px] font-medium ${view.holdout ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {t("holdout")}
            </button>
          )}
          {view.rerunOf && (
            <p className="text-[11px] font-medium text-primary">
              <Repeat2 className="mr-1 inline size-3" />
              {t("rerunOf", { title: view.rerunOf })}
            </p>
          )}
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {t(`region.${view.region}`)}
            {view.goal && <> · {view.goal}</>} · {view.brief}
          </p>
          <p className="mt-1 text-xs">{view.line}</p>
        </div>
        <button
          type="button"
          onClick={judge}
          disabled={judging}
          data-judge={view.judged ? "done" : "todo"}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {judging ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />} {view.judged ? t("rejudge") : t("judge")}
        </button>
        {!view.rerunOf && (
          <button
            type="button"
            onClick={rerun}
            disabled={rerunning}
            title={t("rerunTip")}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {rerunning ? <Loader2 className="size-3.5 animate-spin" /> : <Repeat2 className="size-3.5" />} {rerunning ? t("rerunning") : t("rerun")}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await setInTestSetAction(view.runId, false), router.refresh()))}
          title={t("remove")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>

      {view.lists.map((l) => (
        <div key={l.platform} className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <PlatformIcon platform={l.platform} className="size-3.5" /> {t("topClips", { n: l.clips.length })}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {l.clips.map((it) => (
              <div key={it.item} className="w-24 shrink-0 space-y-1">
                <Link href={`/app/video/${it.videoId}`} className="relative block aspect-[9/14] overflow-hidden rounded-xl bg-muted">
                  <Thumb src={it.thumbnailUrl} videoId={it.videoId ?? undefined} />
                </Link>
                <p className="truncate text-[11px]">@{it.handle}</p>
                <LabelPicker runId={view.runId} it={it} />
              </div>
            ))}
          </div>
          {l.creators.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {l.creators.map((it) => (
                <span key={it.item} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs">
                  @{it.handle}
                  <LabelPicker runId={view.runId} it={it} />
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </article>
  );
}
