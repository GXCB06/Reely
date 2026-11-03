"use client";

import { Check, Copy, FileText, Loader2, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { CANVAS_REFINES, type CanvasContent, type CanvasRefine, contentText, SCRIPT_FORMATS } from "@/lib/canvas";
import type { CanvasOutput } from "@/lib/canvas-data";
import { generateAction, saveScriptAction, voteOutputAction } from "../actions";

/** One version: the content for its format, then Copy, Save to scripts, one-tap rewrites and 👍/👎. */
export function OutputCard({ canvasId, output, perDay }: { canvasId: string; output: CanvasOutput; perDay: number }) {
  const t = useTranslations("canvas");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [refining, setRefining] = useState<CanvasRefine | null>(null);
  const [pending, start] = useTransition();
  const c = output.content;

  function copy() {
    void navigator.clipboard.writeText(contentText(c, (b) => t(`beat.${b}`))).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function refine(kind: CanvasRefine) {
    setRefining(kind);
    start(async () => {
      const res = await generateAction(canvasId, output.format, "", locale, { outputId: output.id, kind });
      setRefining(null);
      if (!res.ok) return void toast.error(res.error === "limit" ? t("limit", { n: perDay }) : t("failed"));
      router.refresh();
    });
  }

  const act = (fn: () => Promise<{ ok: boolean }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(t("failed"));
      if (success) toast.success(success);
      router.refresh();
    });

  return (
    <article className="space-y-3 rounded-3xl border bg-card p-4" data-canvas-output={output.format}>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t(`formats.${output.format}.name`)}</span>
        {output.refine && <> · {t("refinedFrom", { kind: t(`refines.${output.refine}`) })}</>} · {format.relativeTime(new Date(output.createdAt))}
        {output.instructions && <> · “{output.instructions}”</>}
      </p>
      <Content c={c} />
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <button type="button" onClick={copy} className="chip">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t("copied") : t("copy")}
        </button>
        {SCRIPT_FORMATS.has(c.format) && (
          <button type="button" disabled={pending} onClick={() => act(() => saveScriptAction(output.id, locale), t("scriptSaved"))} className="chip">
            <FileText className="size-3.5" /> {t("saveScript")}
          </button>
        )}
        <span className="ml-auto inline-flex gap-1">
          <button
            type="button"
            title={t("helpful")}
            aria-pressed={output.vote === 1}
            disabled={pending}
            onClick={() => act(() => voteOutputAction(output.id, output.vote === 1 ? null : 1))}
            className={`rounded-full p-1.5 hover:bg-muted ${output.vote === 1 ? "text-primary" : "text-muted-foreground"}`}
          >
            <ThumbsUp className="size-4" />
          </button>
          <button
            type="button"
            title={t("notHelpful")}
            aria-pressed={output.vote === -1}
            disabled={pending}
            onClick={() => act(() => voteOutputAction(output.id, output.vote === -1 ? null : -1))}
            className={`rounded-full p-1.5 hover:bg-muted ${output.vote === -1 ? "text-rose-600" : "text-muted-foreground"}`}
          >
            <ThumbsDown className="size-4" />
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Wand2 className="size-3.5" /> {t("refine")}
        </span>
        {CANVAS_REFINES.map((k) => (
          <button key={k} type="button" disabled={pending} onClick={() => refine(k)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50">
            {refining === k && <Loader2 className="mr-1 inline size-3 animate-spin" />}
            {t(`refines.${k}`)}
          </button>
        ))}
      </div>
    </article>
  );
}

function From({ handle }: { handle: string }) {
  const t = useTranslations("canvas");
  const h = handle.replace(/^@/, "").trim();
  return h ? <span className="text-[11px] text-primary">{t("from", { handle: h })}</span> : null;
}

const tags = (h: string[]) => h.map((x) => (x.startsWith("#") ? x : `#${x}`)).join(" ");

/** A version's content, laid out for its format. */
function Content({ c }: { c: CanvasContent }) {
  const t = useTranslations("canvas");
  switch (c.format) {
    case "script":
    case "demo":
    case "shopReview":
      return (
        <div className="space-y-3">
          <p className="font-heading text-lg font-bold">
            {c.title} <span className="text-xs font-normal text-muted-foreground">· {t("seconds", { n: c.durationSeconds })}</span>
          </p>
          <ol className="space-y-2.5">
            {c.beats.map((b, i) => (
              <li key={i} className="grid grid-cols-[52px_1fr] gap-2 text-sm">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {b.time}
                  <span className="block font-medium text-foreground">{t(`beat.${b.label}`)}</span>
                </span>
                <span className="space-y-0.5">
                  <span className="block font-medium">{b.voiceover}</span>
                  {b.onScreen && <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-xs">{b.onScreen}</span>}
                  {b.visual && <span className="block text-xs text-muted-foreground italic">{b.visual}</span>}
                  <From handle={b.from} />
                </span>
              </li>
            ))}
          </ol>
          <p className="rounded-2xl bg-muted/60 p-3 text-sm">
            {c.caption}
            {c.hashtags.length > 0 && <span className="mt-1 block text-xs text-primary">{tags(c.hashtags)}</span>}
          </p>
          {c.borrowed && <p className="text-xs text-muted-foreground">{c.borrowed}</p>}
        </div>
      );
    case "hooks":
      return (
        <ol className="space-y-2">
          {c.hooks.map((h, i) => (
            <li key={i} className="rounded-2xl bg-muted/60 p-3 text-sm">
              <span className="font-medium">
                {i + 1}. {h.line}
              </span>
              {h.onScreen && <span className="mt-1 block text-xs">{h.onScreen}</span>}
              {h.why && <span className="mt-1 block text-xs text-muted-foreground">{h.why}</span>}
              <From handle={h.from} />
            </li>
          ))}
        </ol>
      );
    case "brief":
      return (
        <div className="space-y-3 text-sm">
          <p className="font-heading text-lg font-bold">{c.title}</p>
          <p>{c.summary}</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            {c.shots.map((s, i) => (
              <li key={i}>
                {s.shot}
                {s.line && <span className="block font-medium">“{s.line}”</span>}
                {s.note && <span className="block text-xs text-muted-foreground">{s.note}</span>}
              </li>
            ))}
          </ol>
          {c.mustSay.length > 0 && (
            <div>
              <p className="text-xs font-semibold">{t("mustSay")}</p>
              <ul className="list-disc pl-5">{c.mustSay.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          {c.avoid.length > 0 && (
            <div>
              <p className="text-xs font-semibold">{t("avoid")}</p>
              <ul className="list-disc pl-5">{c.avoid.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
          {c.from.filter(Boolean).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("references")}: {c.from.filter(Boolean).map((h) => `@${h.replace(/^@/, "")}`).join(", ")}
            </p>
          )}
        </div>
      );
    case "caption":
      return (
        <ol className="space-y-2">
          {c.options.map((o, i) => (
            <li key={i} className="rounded-2xl bg-muted/60 p-3 text-sm">
              {i + 1}. {o.caption}
              {o.hashtags.length > 0 && <span className="mt-1 block text-xs text-primary">{tags(o.hashtags)}</span>}
            </li>
          ))}
        </ol>
      );
  }
}
