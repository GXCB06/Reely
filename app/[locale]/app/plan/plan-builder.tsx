"use client";

import { CalendarDays, Loader2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { buildPlanAction } from "./actions";

/** "Make a 7-day plan" (or "Make a new plan"): one AI call, then the page shows the plan. */
export function PlanBuilder({ productId, again = false }: { productId: string; again?: boolean }) {
  const t = useTranslations("plan");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function build() {
    setPending(true);
    const res = await buildPlanAction(productId, locale).catch(() => null);
    setPending(false);
    if (!res?.ok) return void toast.error(t(res?.error === "noClips" ? "noClips" : "failed"));
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={build}
      disabled={pending}
      className={
        again
          ? "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : again ? <RotateCcw className="size-4" /> : <CalendarDays className="size-4" />}
      {pending ? t("building") : again ? t("again") : t("build")}
    </button>
  );
}
