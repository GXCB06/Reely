"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { refreshRunAction } from "@/app/[locale]/app/research/actions";
import { useRouter } from "@/i18n/navigation";

/** "Update with new videos": adds what was posted since last time, instead of a whole new research. */
export function RefreshRunButton({ runId, canRefresh }: { runId: string; canRefresh: boolean }) {
  const t = useTranslations("results");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending || !canRefresh}
      title={canRefresh ? t("refreshHint") : t("refreshTooSoon")}
      onClick={() =>
        startTransition(async () => {
          const res = await refreshRunAction(runId).catch(() => ({ ok: false as const, error: "failed" as const }));
          if (!res.ok) return void toast.error(t(res.error === "tooSoon" ? "refreshTooSoon" : "refreshFailed"));
          toast.success(res.added ? t("refreshAdded", { n: res.added }) : t("refreshNone"));
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {pending ? t("refreshing") : t("refresh")}
    </button>
  );
}
