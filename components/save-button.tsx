"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toggleSaveAction } from "@/app/[locale]/app/saved-actions";

export function SaveButton({ videoId, initialSaved = false }: { videoId: number; initialSaved?: boolean }) {
  const t = useTranslations("card");
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setSaved(!saved);
          const res = await toggleSaveAction(videoId, !saved);
          setSaved(res.saved);
        })
      }
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        saved ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
      aria-pressed={saved}
    >
      {saved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
      {saved ? t("saved") : t("save")}
    </button>
  );
}
