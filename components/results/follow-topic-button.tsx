"use client";

import { BellPlus, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { followRunAction } from "@/app/[locale]/app/research/actions";

/** Follow a research topic: the Today page then checks it for new breakouts every day. */
export function FollowTopicButton({ runId, initialFollowed }: { runId: string; initialFollowed: boolean }) {
  const t = useTranslations("results");
  const [followed, setFollowed] = useState(initialFollowed);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await followRunAction(runId, !followed).catch(() => ({ ok: false as const, error: "failed" }));
          if (!res.ok) return void toast.error(t(res.error === "limit" ? "followLimit" : "followFailed"));
          setFollowed(!followed);
          if (!followed) toast.success(t("followedToast"));
        })
      }
      className={`chip ${followed ? "chip-on" : ""}`}
    >
      {followed ? <BellRing className="size-3.5" /> : <BellPlus className="size-3.5" />}
      {t(followed ? "following" : "follow")}
    </button>
  );
}
