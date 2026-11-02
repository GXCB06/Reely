"use client";

import { SkipForward, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import type { LabelClip } from "@/lib/eval-queue-data";
import { repeatClipAction } from "../actions";
import { ClipLabelCard } from "../clip-label-card";

/**
 * After every clip is labelled: earlier clips again, one at a time, unmarked (your first answer is never shown). The
 * second answers measure how consistent the labels are. 2 / 1 / 0 answer, S skips, Z undoes.
 */
export function RepeatRound({ clips, repeatsBefore }: { clips: LabelClip[]; repeatsBefore: number }) {
  const t = useTranslations("eval");
  const [i, setI] = useState(0);
  const current = clips[i] ?? null;

  const answer = useCallback(
    (label: 0 | 1 | 2) => {
      if (!current) return;
      setI((n) => n + 1);
      void repeatClipAction(current.family, current.item, label).then((res) => !res.ok && toast.error(t("check.notSaved")));
    },
    [current, t],
  );
  const skip = useCallback(() => current && setI((n) => n + 1), [current]);
  const undo = useCallback(() => {
    if (i === 0) return;
    const last = clips[i - 1];
    setI((n) => n - 1);
    void repeatClipAction(last.family, last.item, null);
  }, [i, clips]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "2" || e.key === "1" || e.key === "0") answer(Number(e.key) as 0 | 1 | 2);
      else if (e.key === "s" || e.key === "S") skip();
      else if (e.key === "z" || e.key === "Z") undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, skip, undo]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("repeat.progress", { done: Math.min(i, clips.length), total: clips.length, before: repeatsBefore })}</p>
        <p className="text-xs text-muted-foreground">{t("repeat.hint")}</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${clips.length ? Math.round((i / clips.length) * 100) : 0}%` }} />
        </div>
      </div>
      {current ? (
        <ClipLabelCard
          platform={current.platform}
          brief={current.brief}
          clip={current.clip}
          pending={false}
          onAnswer={answer}
          footer={
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
              <button type="button" onClick={skip} className="chip">
                <SkipForward className="size-3.5" /> {t("label.skip")}
              </button>
              <button type="button" onClick={undo} disabled={i === 0} className="chip disabled:opacity-50">
                <Undo2 className="size-3.5" /> {t("label.undo")}
              </button>
              <span>{t("label.keys")}</span>
            </div>
          }
        />
      ) : (
        <p className="rounded-3xl border bg-card p-4 text-sm">
          {t("repeat.finished")}{" "}
          <Link href="/app/eval/check" className="font-medium text-primary hover:underline">
            {t("label.seeResults")}
          </Link>
        </p>
      )}
    </div>
  );
}
