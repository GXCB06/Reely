"use client";

import { LayoutTemplate, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { analyseChannelAction, ideaToCanvasAction } from "../../actions";

/** "Analyse my channel" (or "Analyse again" once newer posts are in). One AI call, no credits. */
export function AnalyseButton({ platform, handle, again }: { platform: string; handle: string; again: boolean }) {
  const t = useTranslations("me");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      data-me="analyse"
      onClick={() =>
        start(async () => {
          const res = await analyseChannelAction(platform, handle, locale);
          if (!res.ok) return void toast.error(t(res.error === "noPosts" ? "auditNoPosts" : "auditFailed"));
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {pending ? t("analysing") : again ? t("analyseAgain") : t("analyse")}
    </button>
  );
}

/** One idea → a new canvas with the clips it builds on and the idea as its note. */
export function IdeaToCanvas({ platform, handle, index }: { platform: string; handle: string; index: number }) {
  const t = useTranslations("me");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await ideaToCanvasAction(platform, handle, index);
          if (!res.ok) return void toast.error(t("auditFailed"));
          router.push(`/app/canvas/${res.id}`);
        })
      }
      className="chip"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LayoutTemplate className="size-3.5" />} {t("openInCanvas")}
    </button>
  );
}
