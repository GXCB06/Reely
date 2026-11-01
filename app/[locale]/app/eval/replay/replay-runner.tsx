"use client";

import { Camera, Copy, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { prepareReplayAction, saveSnapshotAction } from "../actions";

/**
 * Gets the briefs ready one by one (fills missing relevance scores, judges what the variants surface: AI only, no
 * credits), then copies the tables or saves them as a snapshot.
 */
export function ReplayRunner({ pending, markdown, snapshot }: { pending: string[]; markdown: string; snapshot: Record<string, unknown> }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [note, setNote] = useState("");
  const [saving, startSave] = useTransition();

  async function prepare() {
    setProgress({ done: 0, of: pending.length });
    let failed = 0;
    for (const [i, id] of pending.entries()) {
      const res = await prepareReplayAction(id).catch(() => null);
      if (!res?.ok) failed++;
      setProgress({ done: i + 1, of: pending.length });
    }
    setProgress(null);
    if (failed) toast.error(t("replay.prepareFailed", { n: failed }));
    router.refresh();
  }

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-3xl border bg-card p-4">
      <button
        type="button"
        disabled={!pending.length || progress !== null}
        onClick={() => void prepare()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {progress ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {progress ? t("replay.preparing", { done: progress.done, of: progress.of }) : t("replay.prepare", { n: pending.length })}
      </button>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={120}
        placeholder={t("snapshotNote")}
        className="h-8 w-48 rounded-full border bg-background px-3 text-xs outline-none"
      />
      <button
        type="button"
        disabled={saving || pending.length > 0}
        onClick={() =>
          startSave(async () => {
            const res = await saveSnapshotAction(note, { replay: snapshot });
            if (!res.ok) return void toast.error(t("snapshotFailed"));
            toast.success(t("snapshotSaved"));
            setNote("");
          })
        }
        className="chip"
      >
        <Camera className="size-3.5" /> {t("saveSnapshot")}
      </button>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(markdown).then(() => toast.success(t("copied")), () => toast.error(t("copyFailed")))}
        className="chip"
      >
        <Copy className="size-3.5" /> {t("copyMarkdown")}
      </button>
      {pending.length > 0 && !progress && <p className="w-full text-xs text-muted-foreground">{t("replay.pendingHint", { n: pending.length })}</p>}
    </section>
  );
}
