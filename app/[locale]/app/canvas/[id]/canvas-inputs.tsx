"use client";

import { ExternalLink, Loader2, Plus, StickyNote, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/platform-icon";
import { Thumb } from "@/components/thumb";
import { useRouter } from "@/i18n/navigation";
import { MAX_CLIPS, NOTE_MAX } from "@/lib/canvas";
import type { CanvasClip } from "@/lib/canvas-data";
import { formatMultiplier } from "@/lib/scoring";
import { addClipLinkAction, addClipsAction, removeClipAction, setNoteAction } from "../actions";

type Tab = "research" | "saved" | "link";

/** Step 1: the reference clips (up to 6, with a picker), and the founder's note and page. */
export function CanvasInputs({
  canvasId,
  clips,
  note,
  link,
  choices,
}: {
  canvasId: string;
  clips: CanvasClip[];
  note: string;
  link: string;
  choices: { research: CanvasClip[]; saved: CanvasClip[] };
}) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const [picking, setPicking] = useState(clips.length === 0);
  const [tab, setTab] = useState<Tab>(choices.research.length ? "research" : choices.saved.length ? "saved" : "link");
  const [pasted, setPasted] = useState("");
  const [noteText, setNoteText] = useState(note);
  const [linkText, setLinkText] = useState(link);
  const [pending, start] = useTransition();
  const full = clips.length >= MAX_CLIPS;
  const onCanvas = new Set(clips.map((c) => c.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ? t(`errors.${res.error}`) : t("failed"));
      done?.();
      router.refresh();
    });

  const list = tab === "research" ? choices.research : choices.saved;

  return (
    <>
      <section className="space-y-3 rounded-3xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading font-bold">
            <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">1</span>
            {t("step.refs")} <span className="text-sm font-normal text-muted-foreground">({clips.length}/{MAX_CLIPS})</span>
          </h2>
          {!picking && !full && (
            <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 text-sm text-primary">
              <Plus className="size-4" /> {t("addClips")}
            </button>
          )}
        </div>
        {clips.length === 0 && <p className="text-xs text-muted-foreground">{t("noClips")}</p>}
        <ul className="space-y-2">
          {clips.map((c) => (
            <li key={c.id}>
              <ClipRow clip={c} action={<IconButton label={t("remove")} disabled={pending} onClick={() => run(() => removeClipAction(canvasId, c.id))} icon={<X className="size-4" />} />} />
            </li>
          ))}
        </ul>

        {picking && (
          <div className="space-y-2 rounded-2xl bg-muted/50 p-3" data-canvas="picker">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["research", "saved", "link"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`rounded-full px-3 py-1 text-xs ${tab === k ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border"}`}
                >
                  {t(k === "research" ? "fromResearch" : k === "saved" ? "fromSaved" : "pasteLink")}
                </button>
              ))}
              <button type="button" onClick={() => setPicking(false)} className="ml-auto text-xs text-muted-foreground hover:underline">
                {t("close")}
              </button>
            </div>
            {full && <p className="text-xs text-amber-700">{t("full")}</p>}
            {tab === "link" ? (
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => addClipLinkAction(canvasId, pasted), () => setPasted(""));
                }}
              >
                <div className="flex gap-2">
                  <input
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder={t("pastePlaceholder")}
                    className="min-w-0 flex-1 rounded-full border bg-background px-3 py-1.5 text-sm"
                  />
                  <button type="submit" disabled={pending || full || pasted.trim().length < 8} className="rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : t("add")}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("pasteHint")}</p>
              </form>
            ) : list.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t(tab === "research" ? "noResearchClips" : "noSaved")}</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {list.map((c) => (
                  <li key={c.id}>
                    <ClipRow
                      clip={c}
                      action={
                        onCanvas.has(c.id) ? null : (
                          <IconButton label={t("add")} disabled={pending || full} onClick={() => run(() => addClipsAction(canvasId, [c.id]))} icon={<Plus className="size-4" />} />
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-3xl border bg-card p-4">
        <h2 className="inline-flex items-center gap-1.5 font-heading font-bold">
          <StickyNote className="size-4 text-primary" /> {t("note")}
        </h2>
        <textarea
          value={noteText}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={t("notePlaceholder")}
          className="w-full resize-y rounded-2xl border bg-background px-3 py-2 text-sm"
        />
        <label className="block text-xs text-muted-foreground">
          {t("link")}
          <input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder={t("linkPlaceholder")}
            className="mt-1 w-full rounded-full border bg-background px-3 py-1.5 text-sm text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={pending || (noteText === note && linkText === link)}
          onClick={() => run(() => setNoteAction(canvasId, noteText, linkText.trim()), () => toast.success(t("saved")))}
          className="rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {t("save")}
        </button>
      </section>
    </>
  );
}

function IconButton({ label, onClick, icon, disabled }: { label: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40">
      {icon}
    </button>
  );
}

/** A clip as a small row: cover, @handle, views and multiplier, the caption's start. */
function ClipRow({ clip, action }: { clip: CanvasClip; action: React.ReactNode }) {
  const format = useFormatter();
  return (
    <div className="flex items-start gap-3">
      <a href={clip.url} target="_blank" rel="noreferrer" className="relative block w-12 shrink-0 overflow-hidden rounded-lg">
        <div className="aspect-[9/16]">
          <Thumb src={clip.thumbnailUrl} videoId={clip.id} className="h-full w-full object-cover" />
        </div>
      </a>
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <PlatformIcon platform={clip.platform as "tiktok" | "youtube" | "instagram"} className="size-3" />@{clip.handle}
          {clip.views !== null && <> · {format.number(clip.views, { notation: "compact", maximumFractionDigits: 1 })}</>}
          {clip.usual !== null && <span className="font-medium text-primary"> · {formatMultiplier(clip.usual)}x</span>}
          <a href={clip.url} target="_blank" rel="noreferrer" className="ml-auto">
            <ExternalLink className="size-3" />
          </a>
        </p>
        <p className="line-clamp-2">{clip.caption || "—"}</p>
      </div>
      {action}
    </div>
  );
}
