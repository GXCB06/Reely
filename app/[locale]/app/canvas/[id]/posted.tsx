"use client";

import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Thumb } from "@/components/thumb";
import { useRouter } from "@/i18n/navigation";
import type { CanvasOutput } from "@/lib/canvas-data";
import { formatMultiplier } from "@/lib/scoring";
import { markPostedAction, postCandidatesAction, unmarkPostedAction } from "../actions";

type Candidates = Extract<Awaited<ReturnType<typeof postCandidatesAction>>, { ok: true }>;

/**
 * "Did it work?" on a canvas version: once linked, how the post did against the channel's usual (marked "still
 * growing" in its first days); before that, "I posted this" with the likely posts from the founder's own channels.
 */
export function PostedStrip({ output }: { output: CanvasOutput }) {
  const t = useTranslations("canvas.posted");
  const format = useFormatter();
  const now = useNow();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Candidates | null>(null);
  const [link, setLink] = useState("");
  const [pending, start] = useTransition();
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });

  if (output.posted) {
    const p = output.posted;
    const r = p.result;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30" data-canvas="posted">
        <a href={p.url} target="_blank" rel="noreferrer" className="block w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
          <span className="block aspect-[9/16]">
            <Thumb src={p.thumbnailUrl} videoId={p.id} className="h-full w-full object-cover" />
          </span>
        </a>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4 text-emerald-600" /> {t("title", { handle: p.handle })}
          </p>
          <p className="tabular-nums">
            {r.views !== null ? t("views", { views: compact(r.views) }) : "—"}
            {r.x !== null && <> · <span className="font-semibold">{t("x", { x: formatMultiplier(r.x) })}</span></>} · {t(`label.${r.label}`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {p.publishedAt && t("postedOn", { when: format.relativeTime(new Date(p.publishedAt), now) })}
            {r.growing && <> · {t("growing")}</>}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          title={t("unlink")}
          aria-label={t("unlink")}
          onClick={() => start(async () => void (await unmarkPostedAction(output.id), router.refresh()))}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  function toggle() {
    setOpen((o) => !o);
    if (!found) {
      start(async () => {
        const res = await postCandidatesAction(output.id);
        setFound(res.ok ? res : { ok: true, channels: 0, posts: [] });
      });
    }
  }

  function link_(target: { videoId: number } | { link: string }) {
    start(async () => {
      const res = await markPostedAction(output.id, target);
      if (!res.ok) return void toast.error(t(`errors.${"error" in res ? res.error : "invalid"}`));
      toast.success(t("linked"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={toggle} className="chip" data-canvas="i-posted">
        <Send className="size-3.5" /> {t("iPosted")}
      </button>
      {open && (
        <div className="space-y-2 rounded-2xl bg-muted/50 p-3 text-sm" data-canvas="post-picker">
          <p className="text-xs text-muted-foreground">{t("pickHint")}</p>
          {found === null ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : found.channels === 0 ? (
            <p className="text-xs">{t("noChannel")}</p>
          ) : found.posts.length === 0 ? (
            <p className="text-xs">{t("noPosts")}</p>
          ) : (
            <ul className="space-y-1.5">
              {found.posts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => link_({ videoId: p.id })}
                    className="flex w-full items-center gap-2 rounded-xl p-1.5 text-left hover:bg-card disabled:opacity-50"
                  >
                    <span className="block w-8 shrink-0 overflow-hidden rounded-md">
                      <span className="block aspect-[9/16]">
                        <Thumb src={p.thumbnailUrl} videoId={p.id} className="h-full w-full object-cover" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-xs">{p.caption || "—"}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        @{p.handle}
                        {p.publishedAt && <> · {format.dateTime(new Date(p.publishedAt), { day: "numeric", month: "short" })}</>}
                        {p.views !== null && <> · {compact(p.views)}</>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              link_({ link });
            }}
          >
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t("pastePlaceholder")} className="min-w-0 flex-1 rounded-full border bg-background px-3 py-1.5 text-xs" />
            <button type="submit" disabled={pending || link.trim().length < 8} className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
              {t("link")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
