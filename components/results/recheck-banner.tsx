"use client";

import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { recheckRelevanceAction } from "@/app/[locale]/app/research/actions";
import { useRouter } from "@/i18n/navigation";

/** Shown when Gemini was too busy to filter a research: says so, and re-checks the saved results for free. */
export function RecheckBanner({ runId }: { runId: string }) {
  const t = useTranslations("results");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function recheck() {
    setPending(true);
    const res = await recheckRelevanceAction(runId, locale).catch(() => null);
    setPending(false);
    if (!res?.ok) return void toast.error(t(res?.error === "busy" ? "recheckBusy" : "recheckFailed"));
    toast.success(t("recheckDone", { n: res.dropped }));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <TriangleAlert className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{t("recheckNote")}</p>
      <button
        type="button"
        onClick={recheck}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        {pending ? t("rechecking") : t("recheck")}
      </button>
    </div>
  );
}
