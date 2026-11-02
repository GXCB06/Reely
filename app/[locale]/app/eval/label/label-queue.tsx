"use client";

import { SkipForward, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { REPEAT_EVERY } from "@/lib/eval-queue";
import type { LabelClip } from "@/lib/eval-queue-data";
import { labelClipAction, repeatClipAction, undoClipAction } from "../actions";
import { ClipLabelCard } from "../clip-label-card";

type Done = { kind: "label" | "repeat"; clip: LabelClip };

/**
 * The labelling queue, one clip at a time: answers save in the background so the next clip shows at once; 2 / 1 / 0
 * answer, S skips, Z undoes the last answer. About every REPEAT_EVERY answers an earlier clip comes back unmarked.
 * When the batch runs out the page loads the next one.
 */
export function LabelQueue({
  batch,
  repeats: firstRepeats,
  total,
  done: doneBefore,
  perFamily: familyBefore,
}: {
  batch: LabelClip[];
  repeats: LabelClip[];
  total: number;
  done: number;
  perFamily: Record<string, { done: number; total: number }>;
}) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [items, setItems] = useState(batch);
  const [repeats, setRepeats] = useState(firstRepeats);
  const [i, setI] = useState(0);
  const [showRepeat, setShowRepeat] = useState(false);
  const [sinceRepeat, setSinceRepeat] = useState(0);
  const [done, setDone] = useState(doneBefore);
  const [perFamily, setPerFamily] = useState(familyBefore);
  const [history, setHistory] = useState<Done[]>([]);
  const loading = useRef(false);

  const current = showRepeat ? (repeats[0] ?? null) : (items[i] ?? null);
  const bump = (family: string, by: number) =>
    setPerFamily((p) => ({ ...p, [family]: { done: (p[family]?.done ?? 0) + by, total: p[family]?.total ?? 0 } }));

  const answer = useCallback(
    (label: 0 | 1 | 2) => {
      if (!current) return;
      const clip = current;
      setHistory((h) => [...h, { kind: showRepeat ? "repeat" : "label", clip }]);
      if (showRepeat) {
        setRepeats((r) => r.slice(1));
        setShowRepeat(false);
        setSinceRepeat(0);
        void repeatClipAction(clip.family, clip.item, label).then((res) => !res.ok && toast.error(t("check.notSaved")));
        return;
      }
      setI((n) => n + 1);
      setDone((n) => n + 1);
      bump(clip.family, 1);
      const next = sinceRepeat + 1;
      setSinceRepeat(next);
      if (next >= REPEAT_EVERY && repeats.length) setShowRepeat(true);
      void labelClipAction(clip.family, clip.item, clip.platform, label).then((res) => {
        if (res.ok) return;
        toast.error(t("check.notSaved"));
        // Ask again later rather than lose it.
        setItems((list) => [...list, clip]);
        setDone((n) => n - 1);
        bump(clip.family, -1);
      });
    },
    [current, showRepeat, sinceRepeat, repeats.length, t],
  );

  const skip = useCallback(() => {
    if (!current) return;
    if (showRepeat) {
      setRepeats((r) => r.slice(1));
      setShowRepeat(false);
      return;
    }
    setItems((list) => [...list.slice(0, i), ...list.slice(i + 1), list[i]]);
  }, [current, showRepeat, i]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    if (last.kind === "repeat") {
      setRepeats((r) => [last.clip, ...r]);
      setShowRepeat(true);
      void repeatClipAction(last.clip.family, last.clip.item, null);
      return;
    }
    setShowRepeat(false);
    setI((n) => Math.max(0, n - 1));
    setDone((n) => n - 1);
    bump(last.clip.family, -1);
    setSinceRepeat((n) => Math.max(0, n - 1));
    void undoClipAction(last.clip.family, last.clip.item).then((res) => !res.ok && toast.error(t("check.notSaved")));
  }, [history, t]);

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

  // The batch ran out: load the next one (answers already saved).
  const exhausted = !current && done < total;
  useEffect(() => {
    if (!exhausted || loading.current) return;
    loading.current = true;
    const id = setTimeout(() => router.refresh(), 800);
    return () => clearTimeout(id);
  }, [exhausted, router]);

  // The next clip's cover, fetched early so it shows at once.
  const upcoming = items[i + 1];
  const family = current ? perFamily[current.family] : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">{t("label.progress", { done, total })}</span>
          {family && current && (
            <span className="text-muted-foreground">{t("label.briefProgress", { title: current.brief.title, done: family.done, total: family.total })}</span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
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
              <button type="button" onClick={undo} disabled={!history.length} className="chip disabled:opacity-50">
                <Undo2 className="size-3.5" /> {t("label.undo")}
              </button>
              <span>{t("label.keys")}</span>
            </div>
          }
        />
      ) : (
        <p className="rounded-3xl border bg-card p-4 text-sm">
          {done >= total ? (
            <>
              {t("label.finished")}{" "}
              <Link href="/app/eval/check" className="font-medium text-primary hover:underline">
                {t("label.seeResults")}
              </Link>
            </>
          ) : (
            t("label.loadingMore")
          )}
        </p>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {upcoming?.clip.thumbnailUrl && <img src={upcoming.clip.thumbnailUrl} alt="" className="hidden" />}
    </div>
  );
}
