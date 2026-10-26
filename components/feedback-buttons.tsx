"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { voteClipAction } from "@/app/[locale]/app/feedback-actions";
import type { Vote } from "@/lib/feedback";

// The "Reely will remember" note shows once per page load, not on every tap.
let explained = false;

/** "Useful for this product?" 👍/👎 on a clip; the next research for the product learns from it. */
export function FeedbackButtons({ productId, videoId, initialVote }: { productId: string; videoId: number; initialVote: Vote | null }) {
  const t = useTranslations("card");
  const [vote, setVote] = useState<Vote | null>(initialVote);

  function cast(next: Vote) {
    const before = vote;
    const value = vote === next ? null : next;
    setVote(value);
    voteClipAction(productId, videoId, value ?? 0)
      .then((res) => {
        if (!res.ok) throw new Error();
        if (value && !explained) {
          explained = true;
          toast.success(t("learned"));
        }
      })
      .catch(() => {
        setVote(before);
        toast.error(t("voteFailed"));
      });
  }

  const style = (on: boolean, color: string) =>
    `grid size-7 place-items-center rounded-full transition ${on ? color : "text-muted-foreground hover:bg-muted"}`;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="mr-auto">{t("useful")}</span>
      <button type="button" onClick={() => cast(1)} aria-pressed={vote === 1} title={t("upTip")} className={style(vote === 1, "bg-emerald-100 text-emerald-700")}>
        <ThumbsUp className="size-3.5" />
      </button>
      <button type="button" onClick={() => cast(-1)} aria-pressed={vote === -1} title={t("downTip")} className={style(vote === -1, "bg-rose-100 text-rose-700")}>
        <ThumbsDown className="size-3.5" />
      </button>
    </div>
  );
}
