"use client";

import { ArrowUp, Flame, Loader2, Search } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type FollowUpReply, followUpAction } from "@/app/[locale]/app/research/actions";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { formatMultiplier } from "@/lib/scoring";

type Turn = { question: string; answer: FollowUpReply | "failed" | null };

/**
 * "Ask Reely about these results": the user writes what they want next. Reely answers from this research's clips
 * (citing them) or proposes a new search they can start. Starter questions only fill the box, so they can edit.
 */
export function FollowUpBox({ runId }: { runId: string }) {
  const t = useTranslations("results");
  const format = useFormatter();
  const locale = useLocale();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const busy = turns.at(-1)?.answer === null;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function ask() {
    const question = text.trim();
    if (question.length < 2 || busy) return;
    setText("");
    setTurns((ts) => [...ts, { question, answer: null }]);
    const res = await followUpAction(runId, question, locale).catch(() => null);
    setTurns((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, answer: res?.ok ? res : "failed" } : x)));
  }

  return (
    <div className="space-y-3">
      {turns.map((turn, i) => (
        <div key={i} className="space-y-2">
          <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-primary/10 px-4 py-2 text-sm whitespace-pre-wrap">{turn.question}</p>
          {turn.answer === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("askThinking")}
            </p>
          ) : turn.answer === "failed" ? (
            <p className="text-sm text-muted-foreground">{t("askFailed")}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm leading-relaxed whitespace-pre-line">{turn.answer.reply}</p>
              {(turn.answer.clips.length > 0 || turn.answer.reference) && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[...(turn.answer.reference ? [{ ...turn.answer.reference, isReference: true }] : []), ...turn.answer.clips.map((c) => ({ ...c, isReference: false }))].map((c) => (
                    <Link
                      key={`${c.isReference ? "ref" : "clip"}:${c.dbId}`}
                      href={`/app/video/${c.dbId}`}
                      className={`relative w-24 shrink-0 overflow-hidden rounded-xl border bg-card hover:shadow ${c.isReference ? "ring-2 ring-primary" : ""}`}
                    >
                      {c.isReference && (
                        <span className="absolute top-1 left-1 z-10 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {t("askReference")}
                        </span>
                      )}
                      <div className="aspect-[9/14] bg-muted">
                        <Thumb src={c.thumbnailUrl} videoId={c.dbId} />
                      </div>
                      <p className="truncate px-1.5 pt-1 text-[11px] font-medium">@{c.handle}</p>
                      <p className="flex items-center gap-1 px-1.5 pb-1.5 text-[11px] text-muted-foreground">
                        {c.views !== null && format.number(c.views, { notation: "compact", maximumFractionDigits: 1 })}
                        {c.multiplier !== null && (
                          <span className="inline-flex items-center text-primary">
                            <Flame className="size-3" />
                            {formatMultiplier(c.multiplier)}×
                          </span>
                        )}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
              {turn.answer.researchHref && (
                <Link
                  href={turn.answer.researchHref}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Search className="size-4" /> {t("askResearch")}
                </Link>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-end gap-2 rounded-3xl border bg-background p-2 focus-within:ring-2 focus-within:ring-primary/30">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask();
            }
          }}
          rows={2}
          maxLength={500}
          placeholder={t("askPlaceholder")}
          aria-label={t("askPlaceholder")}
          className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={busy || text.trim().length < 2}
          aria-label={t("askSend")}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(["first", "why", "more", "like"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setText(t(`askStarter.${k}`));
              inputRef.current?.focus();
            }}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t(`askStarter.${k}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
