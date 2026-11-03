"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { markPostedAction } from "@/app/[locale]/app/canvas/actions";
import { useRouter } from "@/i18n/navigation";

const DISMISSED = "reely:dismissed-post-links";

/** Reads the suggestions this person said "no" to (this browser only; an empty list if storage is blocked). */
function dismissed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** "Is this the video you made from '{title}'?": yes links it; no hides the suggestion in this browser. */
export function SuggestLink({ outputId, videoId, title, caption }: { outputId: string; videoId: number; title: string; caption: string }) {
  const t = useTranslations("me.made");
  const router = useRouter();
  const key = `${outputId}:${videoId}`;
  const [hidden, setHidden] = useState(true);
  const [pending, start] = useTransition();

  // Shown only after mount, once this browser's "no" list is known (avoids a flash of a dismissed suggestion).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHidden(dismissed().includes(key)), [key]);
  if (hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-primary/5 p-3 text-sm ring-1 ring-primary/20" data-me="suggest-link">
      <p className="min-w-0 flex-1">
        {t("suggest", { title })}
        <span className="block line-clamp-1 text-xs text-muted-foreground">{caption}</span>
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markPostedAction(outputId, { videoId }, "other");
            if (!res.ok) return void toast.error(t("failed"));
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
      >
        <Check className="size-3.5" /> {t("yes")}
      </button>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED, JSON.stringify([...dismissed(), key].slice(-50)));
          } catch {
            // Storage blocked: the suggestion just hides for now.
          }
          setHidden(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs"
      >
        <X className="size-3.5" /> {t("no")}
      </button>
    </div>
  );
}
