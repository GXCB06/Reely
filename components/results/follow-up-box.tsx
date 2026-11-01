"use client";

import { ArrowUp, Loader2, Paperclip, RotateCcw, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { logEventAction } from "@/app/[locale]/app/feedback-actions";
import { followUpAction } from "@/app/[locale]/app/research/actions";
import { PlatformIcon } from "@/components/platform-icon";
import { Link } from "@/i18n/navigation";
import type { AskAnswer, AskTurn } from "@/lib/ask";
import { type ClipLink, parseClipLink } from "@/lib/clip-link";
import { ClipGrid, HookList, ScriptCard } from "./ask-cards";

type Turn = { requestId: string; question: string; answer: AskAnswer | "failed" | null };

/** "@handle" for a TikTok link, "Reel" for Instagram (no lookup, so nothing is spent before sending). */
function ClipChip({ clip, onRemove }: { clip: ClipLink; onRemove?: () => void }) {
  const t = useTranslations("results");
  const handle = clip.url.match(/tiktok\.com\/(@[\w.-]+)/i)?.[1];
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent py-1 pr-1.5 pl-2 text-xs text-accent-foreground">
      <PlatformIcon platform={clip.platform} className="size-3.5" />
      <span className="truncate">{t("askClipChip", { what: handle ?? (clip.platform === "instagram" ? "Reel" : "TikTok") })}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t("askClipRemove")} className="rounded-full p-0.5 hover:bg-background/60">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** One answer: a short reply, then its cards (clips, hooks or a script) and, when Reely proposes one, a new search. */
function Answer({ answer, busy, onAsk }: { answer: AskAnswer; busy: boolean; onAsk: (question: string) => void }) {
  const t = useTranslations("results");
  return (
    <div className="space-y-3">
      {answer.reply && <p className="text-sm leading-relaxed whitespace-pre-line">{answer.reply}</p>}
      {answer.kind === "hooks" && answer.hooks.length > 0 && (
        <HookList
          hooks={answer.hooks}
          busy={busy}
          onScript={(i) => onAsk(t("ask.scriptFromHookQ", { n: i + 1, handle: answer.hooks[i].clip.handle }))}
        />
      )}
      {answer.script && <ScriptCard script={answer.script} />}
      {answer.kind !== "hooks" && !answer.script && <ClipGrid clips={answer.clips} reference={answer.reference} />}
      {answer.researchHref && (
        <Link
          href={answer.researchHref}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Search className="size-4" /> {t("askResearch")}
        </Link>
      )}
    </div>
  );
}

/**
 * "Ask Reely about these results": the user writes what they want next, or taps a suggestion (which sends at once).
 * Reely answers from this research's clips with a reply, picked clips, their hooks, or a script it writes and saves;
 * or it proposes a new search. A Reel or TikTok link, attached with 📎 or pasted into the box, becomes the reference
 * clip. The thread is stored, so it is still here after a reload, and later questions can point at earlier answers
 * ("hook 2"). While the box is below the screen, a compact copy of it docks at the bottom of the page.
 */
export function FollowUpBox({ runId, lead, initialTurns }: { runId: string; lead: string | null; initialTurns: AskTurn[] }) {
  const t = useTranslations("results");
  const locale = useLocale();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const busy = turns.some((x) => x.answer === null);
  const [attaching, setAttaching] = useState(false);
  const [attachText, setAttachText] = useState("");
  const [hint, setHint] = useState(false);
  const attached = parseClipLink(attachText);
  const inText = parseClipLink(text);
  const box = useRef<HTMLDivElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);

  // Dock a compact composer while the box is below the screen (the user is still reading the clips above it).
  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setDocked(!entry.isIntersecting && entry.boundingClientRect.top > 0));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const last = [...turns].reverse().find((x) => x.answer && x.answer !== "failed")?.answer as AskAnswer | undefined;
  const suggestions =
    last?.kind === "hooks"
      ? [t("ask.next.scriptFirst"), t("ask.next.whichHook")]
      : last?.kind === "clips"
        ? [t("ask.next.hooksOfThese"), t("ask.next.scriptTop")]
        : last?.kind === "script"
          ? [t("ask.next.moreHooks"), t("ask.next.whatNext")]
          : [t("ask.start.hooks"), ...(lead ? [t("ask.start.script", { handle: lead })] : []), t("ask.start.clips")];

  async function send(turn: { requestId: string; question: string }) {
    setTurns((ts) => [...ts.filter((x) => x.requestId !== turn.requestId), { ...turn, answer: null }]);
    requestAnimationFrame(() => threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const res = await followUpAction(runId, turn.question, locale, turn.requestId).catch(() => null);
    if (!res?.ok) void logEventAction({ name: "ask_failed", source: "ask", requestId: turn.requestId }).catch(() => {});
    setTurns((ts) => ts.map((x) => (x.requestId === turn.requestId ? { ...x, answer: res?.ok ? res.turn.answer : "failed" } : x)));
  }

  function ask(override?: string) {
    if (busy) return;
    const typed = (override ?? text).trim();
    const clip = override ? null : attached;
    const question = clip ? `${typed || t("askClipDefault")}\n${clip.url}` : typed;
    if (question.length < 2) return setHint(true);
    setHint(false);
    if (!override) {
      setText("");
      setAttachText("");
      setAttaching(false);
    }
    void send({ requestId: crypto.randomUUID(), question });
  }

  const composer = (compact: boolean) => (
    <div className="rounded-3xl border bg-background transition focus-within:border-primary/40 focus-within:ring-3 focus-within:ring-primary/10">
      <textarea
        id={compact ? undefined : "ask-input"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (hint) setHint(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            ask();
          }
        }}
        rows={compact ? 1 : 2}
        maxLength={500}
        placeholder={compact ? t("ask.dockPlaceholder") : t("askPlaceholder")}
        aria-label={t("askPlaceholder")}
        className={`block w-full resize-none bg-transparent px-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 ${compact ? "pt-2.5" : "pt-3 pb-1"}`}
      />
      {/* Toolbar: the reference clip on the left, send on the right. */}
      <div className="flex items-center gap-2 px-2 pb-2">
        {attached || inText ? (
          attached ? <ClipChip clip={attached} onRemove={() => setAttachText("")} /> : <ClipChip clip={inText!} />
        ) : attaching && !compact ? (
          <input
            autoFocus
            type="url"
            value={attachText}
            onChange={(e) => setAttachText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAttaching(false)}
            onBlur={() => !attachText.trim() && setAttaching(false)}
            placeholder={t("askAttachPlaceholder")}
            aria-label={t("askAttach")}
            className="h-8 min-w-0 flex-1 rounded-full bg-muted px-3 text-xs outline-none sm:max-w-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (compact) box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              setAttaching(true);
            }}
            title={t("askAttach")}
            aria-label={t("askAttach")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip className="size-3.5" /> {!compact && t("askAttachShort")}
          </button>
        )}
        {hint && <span className="text-xs text-muted-foreground">{t("ask.tooShort")}</span>}
        <button
          type="button"
          onClick={() => ask()}
          disabled={busy}
          aria-label={t("askSend")}
          className={`ml-auto grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-60 ${
            text.trim().length >= 2 || attached ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground"
          }`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {turns.map((turn) => (
        <div key={turn.requestId} className="space-y-2">
          <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-primary/10 px-4 py-2 text-sm whitespace-pre-wrap">{turn.question}</p>
          {turn.answer === null ? (
            <p className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("askThinking")}
            </p>
          ) : turn.answer === "failed" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t("ask.failed")}</span>
              {/* Same request id: if the answer did arrive on the server, the stored one comes back. */}
              <button type="button" disabled={busy} onClick={() => void send(turn)} className="chip">
                <RotateCcw className="size-3.5" /> {t("ask.retry")}
              </button>
            </div>
          ) : (
            <Answer answer={turn.answer} busy={busy} onAsk={(q) => ask(q)} />
          )}
        </div>
      ))}
      <div ref={threadEnd} />

      <div ref={box} className="space-y-2">
        {composer(false)}
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => ask(q)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {docked && (
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 md:right-6 md:left-[18rem]">
          <div className="mx-auto max-w-3xl rounded-3xl shadow-[0_10px_40px_-12px_rgba(86,54,186,0.35)]">{composer(true)}</div>
        </div>
      )}
    </div>
  );
}
